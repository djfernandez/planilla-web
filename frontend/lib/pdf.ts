import { formatDate } from './format';

type EmpresaPdf = { razon: string; ruc: string; direccion: string; logo?: string };
type LineaPdf = { destino: string; motivo: string; proyecto: string; pc: string; monto: number };

const DISCLAIMER =
  'Base Legal: Inciso a1) del artículo 37° del TUO de la Ley del Impuesto a la Renta e inciso v) del articulo 21° del Reglamento de la ley del Impuesto a la Renta, Nota: La falta de consignación de la fecha en que se incurrió en el gasto, nombres y apellidos de cada trabajador, número de DNI, motivo y destino del desplazamiento y monto gastado, respecto a cada desplazamiento sólo inhabilita la planilla para la sustentación del gasto que corresponda a tal desplazamiento. (*) Numeración de la planilla.';

export async function generatePlanillaPdf(input: {
  serie: string;
  numero: string;
  fecha: string;
  nombres: string;
  apellidos: string;
  dni: string;
  empresa?: EmpresaPdf | null;
  rubrica?: string;
  lineas: LineaPdf[];
}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  if (input.empresa?.logo) {
    try { doc.addImage(input.empresa.logo, 'PNG', 15, 12, 30, 15, undefined, 'FAST'); } catch { /* logo opcional */ }
  }
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(input.empresa?.razon || '', 195, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  if (input.empresa?.ruc) doc.text(`R.U.C. ${input.empresa.ruc}`, 195, 19, { align: 'right' });
  if (input.empresa?.direccion) doc.text(input.empresa.direccion, 195, 23, { align: 'right' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`PLANILLA POR GASTO DE MOVILIDAD - Nro. ${input.serie}-${input.numero}`, doc.internal.pageSize.getWidth() / 2, 45, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de Emisión: ${formatDate(input.fecha)}`, 15, 60);
  doc.text(`Trabajador: ${input.nombres} ${input.apellidos}`, 15, 67);
  doc.text(`D.N.I.: ${input.dni}`, 150, 67);

  let y = 80;
  doc.setFont('helvetica', 'bold');
  doc.text('#', 15, y);
  doc.text('Destino', 28, y);
  doc.text('Motivo', 78, y);
  doc.text('Proyecto', 128, y);
  doc.text('PC', 165, y);
  doc.text('Monto (S/)', 195, y, { align: 'right' });
  doc.line(15, y + 2, 195, y + 2);
  y += 8;
  doc.setFont('helvetica', 'normal');

  let total = 0;
  input.lineas.forEach((linea, index) => {
    doc.text(String(index + 1), 15, y);
    doc.text(doc.splitTextToSize(linea.destino, 45), 28, y);
    doc.text(doc.splitTextToSize(linea.motivo, 45), 78, y);
    doc.text(doc.splitTextToSize(linea.proyecto, 30), 128, y);
    doc.text(linea.pc, 165, y);
    doc.text(linea.monto.toFixed(2), 195, y, { align: 'right' });
    y += 10;
    total += linea.monto;
  });

  doc.line(15, y, 195, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Total S/.', 165, y);
  doc.text(total.toFixed(2), 195, y, { align: 'right' });
  if (input.rubrica) {
    try { doc.addImage(input.rubrica, 'PNG', 85, y + 15, 50, 25, undefined, 'FAST'); } catch { /* rúbrica opcional */ }
  }
  doc.line(80, y + 40, 140, y + 40);
  doc.text('Firma del Trabajador', doc.internal.pageSize.getWidth() / 2, y + 45, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text(doc.splitTextToSize(DISCLAIMER, 180), 15, doc.internal.pageSize.getHeight() - 20);
  return doc.output('blob');
}

export async function generateConsentPdf(input: {
  nombres: string;
  apellidos: string;
  dni: string;
  email: string;
  empresa?: EmpresaPdf | null;
  rubrica: string;
}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  if (input.empresa?.logo) {
    try { doc.addImage(input.empresa.logo, 'PNG', 15, 15, 40, 15, undefined, 'FAST'); } catch { /* logo opcional */ }
  }
  let y = 40;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Declaración Jurada y Consentimiento de Uso', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  y += 8;
  if (input.empresa) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(input.empresa.razon || '', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
    y += 10;
  }
  doc.setLineWidth(0.5);
  doc.line(15, y, 195, y);
  y += 10;
  doc.setFontSize(10);
  const metadata = doc.splitTextToSize(
    `Fecha y Hora: ${new Date().toLocaleString('es-PE')}\nNombre Completo: ${input.nombres} ${input.apellidos}\nDNI: ${input.dni}\nCorreo Electrónico: ${input.email}`,
    180,
  );
  doc.text(metadata, 15, y);
  y += metadata.length * 5 + 12;
  doc.setFont('helvetica', 'bold');
  doc.text('Términos Aceptados:', 15, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  const terms = doc.splitTextToSize(
    '1. Acepto la responsabilidad total por el uso de este sistema y la veracidad de la información que registre en él.\n\n2. Confirmo que el correo electrónico asociado a esta cuenta es de mi propiedad y autorizo su uso para la generación y notificación de planillas de movilidad.\n\n3. Acepto que la rúbrica digital registrada a continuación será utilizada como mi firma personal en todos los documentos (PDF) generados por este sistema, sirviendo como validación de los gastos declarados.',
    180,
  );
  doc.text(terms, 15, y);
  y += 55;
  try { doc.addImage(input.rubrica, 'PNG', doc.internal.pageSize.getWidth() / 2 - 30, y, 60, 30, undefined, 'FAST'); } catch { /* rúbrica */ }
  y += 35;
  doc.line(doc.internal.pageSize.getWidth() / 2 - 40, y, doc.internal.pageSize.getWidth() / 2 + 40, y);
  y += 5;
  doc.text('Firma del Trabajador', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
  return doc.output('blob');
}

export async function fetchDataUrl(path: string) {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) return '';
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
