import { BadRequestException, Controller, ForbiddenException, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators';
import { ChatService } from './chat.service';

class MessagesQuery {
  @IsString() @MaxLength(80) room: string;
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 50;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Ticket de un solo uso para conectar el WebSocket. */
  @Post('ticket')
  @HttpCode(200)
  ticket(@CurrentUser() user: AuthUser) {
    return this.chat.issueTicket(user);
  }

  @Get('messages')
  async messages(@CurrentUser() user: AuthUser, @Query() q: MessagesQuery) {
    if (!this.chat.isValidRoom(q.room)) throw new BadRequestException('Sala no válida');
    if (!(await this.chat.canAccess({ id: user.id, name: user.name, role: user.role }, q.room))) throw new ForbiddenException('No tiene acceso a esta sala');
    return { items: await this.chat.history(q.room, q.before ? new Date(q.before) : undefined, q.limit ?? 50) };
  }
}
