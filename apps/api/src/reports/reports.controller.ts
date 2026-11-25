import { Controller, Get, Param, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators';
import { ReportsService } from './reports.service';
import { ExportQuery, ReportQuery } from './reports.types';

/**
 * Reportes y exportaciones. Cada reporte declara los roles que lo pueden ver y aplica el mismo alcance de datos
 * que el resto del sistema (un Técnico solo ve lo asignado a él, también al exportar).
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }

  @Get(':key') run(@Param('key') key: string, @Query() q: ReportQuery, @CurrentUser() u: AuthUser) { return this.svc.run(key, q, u); }

  @Get(':key/export')
  async export(@Param('key') key: string, @Query() q: ExportQuery, @CurrentUser() u: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.svc.export(key, q, u, req.ip);
    res.set({ 'Content-Type': r.contentType, 'Content-Disposition': `attachment; filename="${r.filename}"`, 'Cache-Control': 'no-store', 'X-Rows': String(r.rows) });
    return new StreamableFile(r.data);
  }
}
