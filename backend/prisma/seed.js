const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const PARTIDAS_MOVILIDAD = ['94301', '234120502', '95301', '94303', '95303'];

async function main() {
  for (const codigo of PARTIDAS_MOVILIDAD) {
    await prisma.partidaContable.upsert({
      where: { codigo },
      update: {},
      create: { codigo, descripcion: '' },
    });
    await prisma.movilidadPartida.upsert({
      where: { codigo },
      update: {},
      create: { codigo },
    });
  }

  const users = await prisma.user.count();
  if (users > 0) {
    console.log('Seed: ya hay usuarios, no se crea el administrador.');
    return;
  }

  const email = process.env.ADMIN_EMAIL || 'admin@padova.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      nombres: 'Administrador',
      apellidos: 'Sistema',
      dni: '00000000',
      rol: 'ADMIN',
      activo: true,
      bank: 'BCP',
      currency: 'SOLES',
    },
  });

  console.log(`Seed: administrador creado (${email}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
