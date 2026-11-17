import { formatDate, soles } from './format';
import type { Me, Planilla } from './types';

async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function chunk(value: string) {
  return value.replace(/(.{76})/g, '$1\n');
}

export async function downloadEml(me: Me, planillas: Planilla[]) {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  const saltados: string[] = [];
  for (const planilla of planillas) {
    try {
      const response = await fetch(`/api/planillas/${planilla.id}/pdf`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch {
      saltados.push(planilla.clave);
    }
  }
  if (merged.getPageCount() === 0) {
    throw new Error('No se pudo consolidar ningún PDF.');
  }
  const pdfBytes = await merged.save();
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const pdfFileName = `reembolso_consolidado_${stamp}.pdf`;
  downloadBlob(pdfBlob, pdfFileName);

  const porProyecto: Record<string, number> = {};
  planillas.forEach((planilla) => {
    planilla.lineas.forEach((linea) => {
      const proyecto = linea.proyecto || 'SIN PROYECTO';
      porProyecto[proyecto] = (porProyecto[proyecto] || 0) + linea.monto;
    });
  });
  const total = Object.values(porProyecto).reduce((sum, value) => sum + value, 0);
  const cuadro = Object.entries(porProyecto)
    .map(([proyecto, monto]) => `<tr><td style="border:1px solid #ddd;padding:1px 6px;">${proyecto}</td><td style="border:1px solid #ddd;padding:1px 6px;text-align:right;">${soles(monto)}</td></tr>`)
    .join('');
  const detalle = planillas.flatMap((planilla) => planilla.lineas.map((linea) => `
    <tr>
      <td style="border:1px solid #ddd;padding:4px 6px;">${formatDate(planilla.fechaEmision)}</td>
      <td style="border:1px solid #ddd;padding:4px 6px;">${planilla.clave}</td>
      <td style="border:1px solid #ddd;padding:4px 6px;">${linea.proyecto || 'N/A'}</td>
      <td style="border:1px solid #ddd;padding:4px 6px;">${linea.destino}</td>
      <td style="border:1px solid #ddd;padding:4px 6px;">${linea.motivo}</td>
      <td style="border:1px solid #ddd;padding:4px 6px;">${linea.pc}</td>
      <td style="border:1px solid #ddd;padding:4px 6px;text-align:right;">${soles(linea.monto)}</td>
    </tr>`)).join('');
  const aviso = saltados.length
    ? `<p style="color:red;font-size:11px;"><b>Archivos omitidos en PDF:</b><br>${saltados.map((item) => `• ${item}`).join('<br>')}</p>`
    : '';
  const nombre = `${me.nombres} ${me.apellidos}`.trim();
  const html = `<html><body style="font-family:sans-serif;font-size:14px;color:#333;">
    <p>Estimados, se adjunta la solicitud de reembolso por movilidad consolidada, con el <b>Total General a rendir: ${soles(total)}</b></p>
    <p><b>Cuadro totalizado:</b></p>
    <table style="border-collapse:collapse;font-size:10px;"><thead><tr><th style="border:1px solid #ddd;padding:1px 6px;">Proyecto</th><th style="border:1px solid #ddd;padding:1px 6px;">Total</th></tr></thead><tbody>${cuadro}</tbody></table>
    <p><b>Cuadro detallado:</b></p>
    <table style="border-collapse:collapse;font-size:11px;"><thead><tr>
      <th style="border:1px solid #ddd;padding:4px 6px;">Fecha</th><th style="border:1px solid #ddd;padding:4px 6px;">Planilla</th>
      <th style="border:1px solid #ddd;padding:4px 6px;">Proyecto</th><th style="border:1px solid #ddd;padding:4px 6px;">Destino</th>
      <th style="border:1px solid #ddd;padding:4px 6px;">Motivo</th><th style="border:1px solid #ddd;padding:4px 6px;">PC</th>
      <th style="border:1px solid #ddd;padding:4px 6px;">Monto</th>
    </tr></thead><tbody>${detalle}</tbody></table>
    <p><b>Datos Bancarios:</b><br>Beneficiario: ${nombre}<br>Banco: ${me.bank || '(No configurado)'}<br>N° Cuenta: ${me.accountNumber || '(No configurado)'}<br>Moneda: ${me.currency || '(No configurado)'}</p>
    ${aviso}<p>Saludos.</p><p>${nombre}</p></body></html>`;

  const subject = `Transferencia por Reembolso de movilidad - Consolidado - ${new Date().toLocaleDateString('es-PE')}`;
  const boundary = `----=_Part_${Math.random().toString(16).slice(2)}`;
  const htmlBase64 = btoa(unescape(encodeURIComponent(html)));
  const pdfBase64 = await blobToBase64(pdfBlob);
  const subjectB64 = btoa(unescape(encodeURIComponent(subject)));
  let eml = `From: ${me.email}\n`;
  if (me.emailTo.length) eml += `To: ${me.emailTo.join(', ')}\n`;
  if (me.emailCc.length) eml += `Cc: ${me.emailCc.join(', ')}\n`;
  eml += `Subject: =?UTF-8?B?${subjectB64}?=\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="${boundary}"\n\n`;
  eml += `--${boundary}\nContent-Type: text/html; charset="UTF-8"\nContent-Transfer-Encoding: base64\n\n${chunk(htmlBase64)}\n\n`;
  eml += `--${boundary}\nContent-Type: application/pdf; name="${pdfFileName}"\nContent-Transfer-Encoding: base64\nContent-Disposition: attachment; filename="${pdfFileName}"\n\n${chunk(pdfBase64)}\n\n`;
  eml += `--${boundary}--`;
  downloadBlob(new Blob([eml], { type: 'message/rfc822' }), `${subject.replace(/[^a-z0-9]/gi, '_')}.eml`);
  if (saltados.length) return `Se omitieron: ${saltados.join(', ')}`;
  return '';
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
