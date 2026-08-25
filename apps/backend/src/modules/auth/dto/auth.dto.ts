import { IsEmail, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "password123!" })
  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  passwordHash!: string;

  @ApiProperty({ example: "John Doe" })
  @IsString()
  @MinLength(2, { message: "Display name must be at least 2 characters long" })
  displayName!: string;
}

export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "password123!" })
  @IsString()
  passwordHash!: string;
}
