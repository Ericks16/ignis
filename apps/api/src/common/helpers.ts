import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Normaliza un nombre para detectar duplicados: sin acentos, minúsculas, espacios simples. */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Recorta espacios y convierte cadenas vacías en null (útil para campos opcionales). */
export const trimOrNull = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));

export const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
}

export const pageArgs = (q: PageQuery) => {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

/**
 * Con target ES2022 los DTO tienen todas sus propiedades definidas (valen undefined si no vinieron en la petición).
 * Estos helpers devuelven solo lo que realmente se envió.
 */
export const definedKeys = (obj: object): string[] => Object.entries(obj).filter(([, v]) => v !== undefined).map(([k]) => k);
export const definedOnly = <T extends object>(obj: T): Partial<T> => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
