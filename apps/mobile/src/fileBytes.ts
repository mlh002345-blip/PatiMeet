import { File } from 'expo-file-system';

/**
 * Yerel bir dosya URI'sini yükleme için ham bayta (`ArrayBuffer`) çevirir.
 *
 * Önceden `fetch(uri).then(r => r.blob())` kullanılıyordu; React Native'in
 * `fetch`/`Blob` polyfill'i geliştirme sunucusunda güvenilir çalışsa da,
 * özellikle Android release derlemelerinde büyük dosyalarda gövdenin eksik
 * veya bozuk gönderilmesi bilinen bir sorundur. `expo-file-system`'in `File`
 * sınıfı dosyayı doğrudan native taraftan okuyup `ArrayBuffer` döndürdüğü
 * için bu belirsizliği ortadan kaldırır.
 */
export async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  return file.arrayBuffer();
}
