package rs.kockolov.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void load() {
        super.load();
        // Text the same size as on kockolov.rs in the phone's browser. Android's WebView otherwise
        // scales every font with the system font size setting, and the pages are laid out for 100 %
        // (a larger setting pushed the "Kupi" buttons off the offers list).
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
