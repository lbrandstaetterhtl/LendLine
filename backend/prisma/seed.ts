import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // The demo accounts have passwords published in the README: never in a real installation.
  // NODE_ENV is easily left unset, so a public FRONTEND_ORIGIN counts as "real" too.
  // oxlint-disable-next-line node/no-process-env -- standalone script, outside the app's config
  const { NODE_ENV, FRONTEND_ORIGIN, ALLOW_DEMO_SEED } = process.env;
  const local =
    !FRONTEND_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(FRONTEND_ORIGIN);
  if ((NODE_ENV === "production" || !local) && ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "The demo seed creates accounts with publicly known passwords and only runs locally. Set ALLOW_DEMO_SEED=true for a test installation."
    );
  }
  const adminPassword = await bcrypt.hash("Admin123!", 12);
  const userPassword = await bcrypt.hash("User12345!", 12);

  await prisma.user.upsert({
    where: { email: "admin@lendline.local" },
    update: {},
    create: {
      name: "IT-Verwaltung",
      email: "admin@lendline.local",
      passwordHash: adminPassword,
      // Groups from migration 20260925140000_groups.
      groupId: "group-admin",
    },
  });

  await prisma.user.upsert({
    where: { email: "user@lendline.local" },
    update: {},
    create: {
      name: "Max Mustermann",
      email: "user@lendline.local",
      passwordHash: userPassword,
      groupId: "group-user",
    },
  });

  const categories = ["Laptop", "Monitor", "Beamer", "Zubehör"];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  const devices = [
    {
      name: "ThinkPad T14",
      category: "Laptop",
      serialNumber: "LT-1001",
      description: "14 Zoll, für Dienstreisen. Netzteil liegt bei.",
    },
    {
      name: "Dell Latitude 5440",
      category: "Laptop",
      serialNumber: "LT-1002",
      description: "Standardarbeitsplatz-Laptop.",
    },
    {
      name: "Eizo FlexScan",
      category: "Monitor",
      serialNumber: "MN-2001",
      description: "24 Zoll, HDMI und DisplayPort.",
    },
    {
      name: "Epson Beamer",
      category: "Beamer",
      serialNumber: "BM-3001",
      description: "Für Besprechungsräume. Fernbedienung im Etui.",
      status: "DEFECTIVE" as const,
    },
    {
      name: "Logitech Presenter",
      category: "Zubehör",
      serialNumber: "ZB-4001",
      description: "Presenter mit Laserpointer.",
    },
  ];

  for (const device of devices) {
    const category = await prisma.category.findUniqueOrThrow({ where: { name: device.category } });
    const existing = await prisma.device.findFirst({ where: { name: device.name } });
    if (!existing) {
      await prisma.device.create({
        data: {
          name: device.name,
          description: device.description,
          categoryId: category.id,
          units: {
            create: {
              serialNumber: device.serialNumber,
              status: "status" in device ? device.status : "AVAILABLE",
            },
          },
        },
      });
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
