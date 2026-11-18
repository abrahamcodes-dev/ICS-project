package expo.modules.calladoclocale

import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS persisted preference is authoritative; no second preference store or locale listener. */
class CallADocLocaleModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallADocLocale")
    AsyncFunction("setLanguage") { language: String ->
      require(language == "en" || language == "sw") { "Unsupported language" }
      check(appContext.currentActivity is AppCompatActivity) { "Activity unavailable" }
      val requested = LocaleListCompat.forLanguageTags(language)
      val changed = AppCompatDelegate.getApplicationLocales() != requested
      if (changed) {
        // Public API: retain native toolbar rendering, navigation and accessibility semantics.
        // Android may recreate the Activity. Do not manually recreate it as well.
        AppCompatDelegate.setApplicationLocales(requested)
      }
      changed
    }.runOnQueue(Queues.MAIN)
  }
}
