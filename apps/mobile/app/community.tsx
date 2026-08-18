import { Redirect } from 'expo-router';
import React from 'react';

/**
 * Eski Güvenli Topluluk ekranı.
 *
 * İki ayrı topluluk yapısı `/alerts` altında birleşti. Bu dosya yalnızca eski
 * bağlantıların (derin bağlantı, bildirim, yer imi) kırılmaması için duruyor
 * ve yeni ekrana yönlendiriyor. `Redirect` geçmişe yeni bir kayıt eklemez,
 * böylece geri tuşu kullanıcıyı buraya geri getirmez.
 */
export default function CommunityRedirect() {
  return <Redirect href="/alerts" />;
}
