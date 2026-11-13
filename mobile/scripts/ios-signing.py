#!/usr/bin/env python3
"""
App Store signing for the CI build, without a Mac and without registered devices.

  ios-signing.py setup     makes an Apple Distribution certificate + an App Store profile for rs.kockolov.app
                           through the App Store Connect API, installs them in a throwaway keychain and switches
                           the App target (Release) to manual signing with them
  ios-signing.py cleanup   deletes that profile and revokes that certificate (builds already uploaded stay valid:
                           Apple re-signs App Store and TestFlight builds)

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_FILE (path of the .p8), APPLE_TEAM_ID, RUNNER_TEMP, GITHUB_ENV.
Needs: pip install pyjwt cryptography
"""
from __future__ import annotations

import base64
import json
import os
import pathlib
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request

import jwt

BUNDLE_ID = 'rs.kockolov.app'
API = 'https://api.appstoreconnect.apple.com/v1'
TMP = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'ios-signing'
STATE = TMP / 'state.json'
PROJECT = pathlib.Path(__file__).resolve().parent.parent / 'ios/App/App.xcodeproj/project.pbxproj'
ENTITLEMENTS = PROJECT.parent.parent / 'App/App.entitlements'
APP_RELEASE = '504EC3181FED79650016851F'  # App target, Release configuration


def token() -> str:
    key = pathlib.Path(os.environ['ASC_KEY_FILE']).read_text()
    now = int(time.time())
    return jwt.encode(
        {'iss': os.environ['ASC_ISSUER_ID'], 'iat': now, 'exp': now + 15 * 60, 'aud': 'appstoreconnect-v1'},
        key,
        algorithm='ES256',
        headers={'kid': os.environ['ASC_KEY_ID'], 'typ': 'JWT'},
    )


def api(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f'{API}{path}',
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={'Authorization': f'Bearer {token()}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')
        sys.exit(f'::error::App Store Connect {method} {path}: HTTP {e.code} {detail[:800]}')


def run(*cmd: str, **kw) -> None:
    subprocess.run(cmd, check=True, **kw)


def setup() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    key, csr, cer, pem, p12 = (TMP / n for n in ('dist.key', 'dist.csr', 'dist.cer', 'dist.pem', 'dist.p12'))

    # 1. certificate: a fresh private key, its request, Apple signs it
    run('openssl', 'genrsa', '-out', str(key), '2048')
    run('openssl', 'req', '-new', '-key', str(key), '-out', str(csr), '-subj', '/CN=Kockolov CI/O=Kockolov/C=RS')
    cert = api('POST', '/certificates', {
        'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': csr.read_text()}},
    })['data']
    state = {'certificate': cert['id']}
    STATE.write_text(json.dumps(state))
    cer.write_bytes(base64.b64decode(cert['attributes']['certificateContent']))
    run('openssl', 'x509', '-inform', 'DER', '-in', str(cer), '-out', str(pem))
    password = secrets.token_hex(16)
    # algorithms macOS' keychain can read, whichever openssl the runner has
    run('openssl', 'pkcs12', '-export', '-inkey', str(key), '-in', str(pem), '-out', str(p12), '-passout', f'pass:{password}',
        '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1')

    # 2. throwaway keychain with it
    kc = str(TMP / 'kockolov.keychain-db')
    kc_pw = secrets.token_hex(16)
    run('security', 'create-keychain', '-p', kc_pw, kc)
    run('security', 'set-keychain-settings', '-lut', '3600', kc)
    run('security', 'unlock-keychain', '-p', kc_pw, kc)
    run('security', 'import', str(p12), '-k', kc, '-P', password, '-A', '-t', 'cert', '-f', 'pkcs12')
    run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', kc_pw, kc, stdout=subprocess.DEVNULL)
    existing = subprocess.run(['security', 'list-keychains', '-d', 'user'], capture_output=True, text=True).stdout
    run('security', 'list-keychains', '-d', 'user', '-s', kc, *[k.strip().strip('"') for k in existing.split()])
    state['keychain'] = kc
    STATE.write_text(json.dumps(state))

    # 3. App Store profile for the app with that certificate
    bundles = api('GET', f'/bundleIds?filter[identifier]={BUNDLE_ID}&filter[platform]=IOS')['data']
    bundle = next((b for b in bundles if b['attributes']['identifier'] == BUNDLE_ID), None)
    if not bundle:
        sys.exit(f'::error::Bundle ID {BUNDLE_ID} nije registrovan (developer.apple.com → Identifiers)')
    name = f"Kockolov-CI-{os.environ.get('GITHUB_RUN_ID', int(time.time()))}"
    profile = api('POST', '/profiles', {
        'data': {
            'type': 'profiles',
            'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
            'relationships': {
                'bundleId': {'data': {'type': 'bundleIds', 'id': bundle['id']}},
                'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]},
            },
        },
    })['data']
    state['profile'] = profile['id']
    STATE.write_text(json.dumps(state))
    content = base64.b64decode(profile['attributes']['profileContent'])
    uuid = profile['attributes']['uuid']
    for d in ('Library/MobileDevice/Provisioning Profiles', 'Library/Developer/Xcode/UserData/Provisioning Profiles'):
        p = pathlib.Path.home() / d
        p.mkdir(parents=True, exist_ok=True)
        (p / f'{uuid}.mobileprovision').write_bytes(content)

    # 4. only the App target signs manually with them (the pods keep their own settings)
    src = PROJECT.read_text()
    m = re.search(re.escape(APP_RELEASE) + r' /\* Release \*/ = \{.*?buildSettings = \{(.*?)\n\t\t\t\};', src, re.S)
    if not m:
        sys.exit('::error::Release podešavanja App targeta nisu pronađena u project.pbxproj')
    team = os.environ['APPLE_TEAM_ID']
    block = re.sub(r'\n\t\t\t\tCODE_SIGN_STYLE = \w+;', '', m.group(1))
    block += (
        f'\n\t\t\t\tCODE_SIGN_STYLE = Manual;'
        f'\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";'
        f'\n\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";'
        f'\n\t\t\t\tDEVELOPMENT_TEAM = {team};'
        f'\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{name}";'
    )
    PROJECT.write_text(src[: m.start(1)] + block + src[m.end(1):])
    # the pods are not signed on their own: the app signs its embedded frameworks ("[CP] Embed Pods Frameworks")
    pods = PROJECT.parent.parent / 'Pods/Pods.xcodeproj/project.pbxproj'
    if pods.exists():
        txt = pods.read_text().replace('buildSettings = {', 'buildSettings = {\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;')
        pods.write_text(txt)
    # an App Store profile carries the production push environment
    ENTITLEMENTS.write_text(ENTITLEMENTS.read_text().replace('<string>development</string>', '<string>production</string>'))

    (TMP / 'profile-name').write_text(name)
    print(f'Sertifikat {cert["id"]}, profil „{name}” ({uuid})')


def cleanup() -> None:
    if not STATE.exists():
        return
    state = json.loads(STATE.read_text())
    if state.get('profile'):
        api('DELETE', f"/profiles/{state['profile']}")
    if state.get('certificate'):
        api('DELETE', f"/certificates/{state['certificate']}")
    if state.get('keychain'):
        subprocess.run(['security', 'delete-keychain', state['keychain']], check=False)
    print('Privremeni sertifikat i profil obrisani.')


if __name__ == '__main__':
    {'setup': setup, 'cleanup': cleanup}[sys.argv[1]]()
