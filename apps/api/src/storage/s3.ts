import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from './types';

export interface S3Options {
  bucket: string;
  region: string;
  endpoint: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
  signedUrlTtlSeconds: number;
}

export function createS3Storage(options: S3Options): ObjectStorage {
  const client = new S3Client({
    region: options.region,
    // Cloudflare R2, MinIO gibi S3 uyumlu servisler özel bir uç adresi ister.
    endpoint: options.endpoint ?? undefined,
    // Özel uçlarda yol tabanlı adresleme gerekir (bucket.host yerine host/bucket).
    forcePathStyle: Boolean(options.endpoint),
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  return {
    driver: 's3',

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Bir yıl önbellek: anahtarlar içeriğe özel üretildiği için değişmez.
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }));
    },

    async urlFor(key, urlOptions) {
      if (options.publicBaseUrl && !urlOptions?.forcePrivate) {
        return `${options.publicBaseUrl.replace(/\/$/, '')}/${key}`;
      }
      // Kova özel kalabilsin diye süreli imzalı adres üretiyoruz.
      return getSignedUrl(client, new GetObjectCommand({ Bucket: options.bucket, Key: key }), {
        expiresIn: options.signedUrlTtlSeconds,
      });
    },

    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },

    async ping() {
      // Nesne yazmadan/okumadan yalnız kovanın erişilebilirliğini doğrular
      // (kimlik bilgileri, uç adresi, kova adı doğru mu). Yanlış `S3_ENDPOINT`
      // ile gerçek AWS S3'e gidip R2 kimlik bilgileriyle imza uyuşmazlığı gibi
      // "yapılandırma inşa edildi ama işe yaramıyor" durumlarını burada yakalarız.
      await client.send(new HeadBucketCommand({ Bucket: options.bucket }));
    },
  };
}
