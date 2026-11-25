import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UserOptionsController } from './user-options.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController, UserOptionsController], providers: [UsersService] })
export class UsersModule {}
