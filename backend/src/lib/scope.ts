import { t } from "../i18n/index.js";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";

/**
 * Category lookups for the group scopes in the routes (`assertManageScope`, borrow scope). A
 * missing record answers 404 here already, before any permission detail is revealed.
 */
export async function categoryOfDevice(id: string): Promise<string> {
  const device = await prisma.device.findUnique({ where: { id }, select: { categoryId: true } });
  if (!device)
    throw new HttpError(
      404,
      t((m) => m.errors.deviceNotFound)
    );
  return device.categoryId;
}

export async function categoryOfRequest(id: string): Promise<string> {
  const request = await prisma.borrowRequest.findUnique({
    where: { id },
    select: { device: { select: { categoryId: true } } },
  });
  if (!request)
    throw new HttpError(
      404,
      t((m) => m.errors.requestNotFound)
    );
  return request.device.categoryId;
}

export async function categoryOfUnit(id: string): Promise<string> {
  const unit = await prisma.deviceUnit.findUnique({
    where: { id },
    select: { device: { select: { categoryId: true } } },
  });
  if (!unit)
    throw new HttpError(
      404,
      t((m) => m.errors.unitNotFound)
    );
  return unit.device.categoryId;
}
