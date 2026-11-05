# Kockolov (R8 since app 1.2). Capacitor, Firebase, ML Kit and AndroidX bring their own rules;
# these keep the parts that are reached by name from the web app or from the manifest.

# The plugins are called by name from JavaScript through the Capacitor bridge: keep them whole (they are small)
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class io.capawesome.capacitorjs.plugins.** { *; }

# Methods the WebView calls
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Readable stack traces in Play Console (the mapping file turns names back)
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile
