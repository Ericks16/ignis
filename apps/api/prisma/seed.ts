// Crea el primer administrador desde variables de entorno. No sobrescribe usuarios existentes.
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Defina SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD');
  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) {
      console.log('El administrador ya existe; no se modifica.');
      return;
    }
    await prisma.user.create({
      data: { email, name: 'Administrador', role: Role.ADMIN, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
    });
    console.log(`Administrador creado: ${email} (deberá cambiar la contraseña al ingresar)`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
