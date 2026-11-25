import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { MAX_FILE_BYTES } from './excel.reader';
import { ImportsService } from './imports.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sendXlsx = (res: Response, name: string, data: Buffer) => {
  res.set({ 'Content-Type': XLSX, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
  return new StreamableFile(data);
};

/** Importación de Excel: solo el Administrador. Nada se importa sin vista previa y confirmación explícita. */
@Roles(Role.ADMIN)
@Controller('imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.upload(file, u, req.ip); }

  @Get() list() { return this.svc.list(); }

  // Rutas fijas antes de ':id'
  @Get('template.xlsx')
  async template(@Res({ passthrough: true }) res: Response) { return sendXlsx(res, 'plantilla-importacion-ignis.xlsx', await this.svc.template()); }

  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Get(':id/sheet')
  sheet(@Param('id', ParseUUIDPipe) id: string, @Query('name') name: string, @Query('headerRow') headerRow?: string) {
    return this.svc.sheet(id, name, headerRow ? Math.min(200, Math.max(1, parseInt(headerRow, 10) || 1)) : undefined);
  }

  @Get(':id/preview') currentPreview(@Param('id', ParseUUIDPipe) id: string) { return this.svc.currentPreview(id); }

  @Post(':id/preview') @HttpCode(200)
  preview(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.svc.preview(id, body); }

  @Post(':id/confirm') @HttpCode(200)
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() body: { acknowledge?: boolean }, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.confirm(id, body, u, req.ip); }

  @Post(':id/cancel') @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Req() req: Request) { return this.svc.cancel(id, u, req.ip); }

  @Get(':id/report.xlsx')
  async report(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const r = await this.svc.report(id);
    return sendXlsx(res, r.name, r.data);
  }
}
