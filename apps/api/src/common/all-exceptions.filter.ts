import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/** Respuesta de error uniforme; nunca expone detalles internos. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as any).message ?? exception.message);
      return res.status(exception.getStatus()).json({ statusCode: exception.getStatus(), message });
    }
    // Errores del analizador de cuerpos (http-errors): cuerpo demasiado grande, JSON mal formado, etc.
    const e = exception as { status?: number; type?: string };
    if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && typeof e.type === 'string') {
      const msg = e.status === 413 ? 'El contenido enviado es demasiado grande' : 'Solicitud no válida';
      return res.status(e.status).json({ statusCode: e.status, message: msg });
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'Error interno del servidor' });
  }
}
