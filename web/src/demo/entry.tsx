// Entry of the in-browser preview (npm run build:demo): answer /api from the snapshot,
// show a note about what this page is, then start the normal app.
import { DEMO_DATE, DEMO_EMAIL, DEMO_PASSWORD, installMockApi } from './mockApi';

installMockApi();

const MONTHS = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
const d = DEMO_DATE ? new Date(DEMO_DATE) : null;
const day = d ? `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}.` : '';
const note = document.createElement('div');
note.className = 'demo-note';
note.innerHTML = `<strong>Pregled</strong><span>Cene iz prodavnica od ${day} Izmene važe dok je stranica otvorena.</span><span class="demo-login">Prijava: <code>${DEMO_EMAIL}</code> · <code>${DEMO_PASSWORD}</code></span>`;
document.body.insertBefore(note, document.getElementById('root'));

void import('../main');
