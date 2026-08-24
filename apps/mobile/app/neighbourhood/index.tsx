import { Redirect } from 'expo-router';

/**
 * Eski `/neighbourhood` derin bağlantısı hâlâ çalışsın diye bırakıldı.
 * Gerçek ekran ve veri kaynağı tek: `(tabs)/neighbourhood.tsx`. Burada
 * ikinci bir Mahalle akışı YOK — yalnızca yönlendirme var.
 */
export default function NeighbourhoodRedirect() {
  return <Redirect href="/(tabs)/neighbourhood" />;
}
