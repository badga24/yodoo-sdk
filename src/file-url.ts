/**
 * Les URLs presignées S3/MinIO sont documentées comme non fiables — l'endpoint
 * public de streaming est celui à utiliser (LocaleApp-integration-guide.md §3).
 */
export function buildFileUrl(apiBaseUrl: string, fileId: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/public/file/${fileId}/download`;
}
