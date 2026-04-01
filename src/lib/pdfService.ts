import { supabase } from './supabase';
import { buildStoredDocumentUrl } from './documentAccess';

interface Html2PdfWorker {
  set(options: Record<string, unknown>): Html2PdfWorker;
  from(el: HTMLElement): Html2PdfWorker;
  outputPdf(type: 'blob'): Promise<Blob>;
  save(): Promise<void>;
}

type Html2PdfFn = () => Html2PdfWorker;

let loadPromise: Promise<Html2PdfFn> | null = null;

function loadHtml2Pdf(): Promise<Html2PdfFn> {
  if (loadPromise) return loadPromise;

  loadPromise = import('html2pdf.js').then((module: any) => {
    const html2pdf = module?.default || module;
    if (!html2pdf) {
      throw new Error('html2pdf.js failed to load from local bundle');
    }
    return html2pdf as Html2PdfFn;
  });

  return loadPromise;
}

function buildOptions(filename: string, overrides?: Record<string, unknown>) {
  return {
    filename,
    margin: [10, 10, 10, 10],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    ...overrides,
  };
}

const DOCUMENT_UPLOAD_BUCKETS = ['documents', 'projectceo-photos'] as const;

export async function uploadToAvailableBucket(
  storagePath: string,
  file: Blob,
  contentType: string,
  companyId?: string
) {
  let lastError: Error | null = null;

  // SECURITY FIX: Ensure company isolation in storage paths
  let securePath = storagePath;
  if (companyId && !storagePath.startsWith(companyId)) {
    // Prefix with company ID for multi-tenant isolation
    securePath = `${companyId}/${storagePath}`;
  }

  for (const bucket of DOCUMENT_UPLOAD_BUCKETS) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(securePath, file, { contentType, upsert: false });

    if (!error && data) {
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
      const { data: signedUrlData } = await supabase.storage.from(bucket).createSignedUrl(data.path, 60 * 60);
      return {
        bucket,
        path: data.path,
        publicUrl: publicUrlData.publicUrl,
        signedUrl: signedUrlData?.signedUrl || publicUrlData.publicUrl,
      };
    }

    lastError = new Error(error?.message || `Upload failed for bucket ${bucket}`);
    if (!error?.message?.toLowerCase().includes('bucket')) {
      break;
    }
  }

  throw lastError || new Error('No available storage bucket for document upload');
}

export async function generateAndUploadPdf(
  htmlElement: HTMLElement,
  companyId: string,
  contactId: string,
  documentId: string,
  documentType: string,
  filename: string
) {
  const html2pdf = await loadHtml2Pdf();
  const pdfBlob: Blob = await html2pdf()
    .set(buildOptions(filename))
    .from(htmlElement)
    .outputPdf('blob');

  const storagePath = `${contactId}/${documentType}-${documentId}-${Date.now()}.pdf`;
  const uploaded = await uploadToAvailableBucket(storagePath, pdfBlob, 'application/pdf');

  return {
    blob: pdfBlob,
    storagePath: uploaded.path,
    publicUrl: uploaded.publicUrl,
    storedUrl: buildStoredDocumentUrl(uploaded.publicUrl, uploaded.bucket, uploaded.path),
    bucket: uploaded.bucket,
  };
}

export async function generateAndDownloadPdf(
  htmlElement: HTMLElement,
  filename: string
) {
  const html2pdf = await loadHtml2Pdf();
  await html2pdf().set(buildOptions(filename)).from(htmlElement).save();
}
