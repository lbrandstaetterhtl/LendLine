import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // The demo accounts have passwords published in the README: never in a real installation.
  // oxlint-disable-next-line node/no-process-env -- standalone script, outside the app's config
  if (process.env.NODE_ENV === "production") {
    throw new Error("Der Demo-Seed ist in Produktion (NODE_ENV=production) nicht erlaubt.");
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
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "user@lendline.local" },
    update: {},
    create: {
      name: "Max Mustermann",
      email: "user@lendline.local",
      passwordHash: userPassword,
      role: "USER",
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
