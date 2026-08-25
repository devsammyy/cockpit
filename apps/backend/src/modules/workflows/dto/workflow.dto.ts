import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";

export class CreateWorkflowDto {
  @ApiProperty({ example: "Invoice Approval" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "Declarative workflow definition (steps + connections)." })
  @IsObject()
  definition!: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ["MANUAL", "SCHEDULED", "EVENT"] })
  @IsOptional()
  @IsIn(["MANUAL", "SCHEDULED", "EVENT"])
  triggerType?: string;

  @ApiPropertyOptional({ description: "Cron for SCHEDULED, event name for EVENT triggers." })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ["ACTIVE", "DRAFT", "ARCHIVED"] })
  @IsOptional()
  @IsIn(["ACTIVE", "DRAFT", "ARCHIVED"])
  status?: string;

  @ApiPropertyOptional({ enum: ["MANUAL", "SCHEDULED", "EVENT"] })
  @IsOptional()
  @IsIn(["MANUAL", "SCHEDULED", "EVENT"])
  triggerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changelog?: string;
}

export class StartExecutionDto {
  @ApiPropertyOptional({ description: "Initial input passed into the workflow variables." })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class PlanGoalDto {
  @ApiProperty({ example: "Categorize the latest support ticket and escalate if critical." })
  @IsString()
  @MinLength(8)
  goal!: string;

  @ApiPropertyOptional({ description: "Persist the planned workflow and start a run immediately." })
  @IsOptional()
  execute?: boolean;
}

export class RollbackVersionDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  versionNumber!: number;
}

export class ApprovalDecisionDto {
  @ApiProperty({ enum: ["APPROVE", "REJECT"] })
  @IsIn(["APPROVE", "REJECT"])
  action!: "APPROVE" | "REJECT";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class EmitEventDto {
  @ApiProperty({ example: "invoice.received" })
  @IsString()
  event!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class EnableScheduleDto {
  @ApiProperty({ description: "Cron pattern (BullMQ syntax)", example: "0 9 * * 1-5" })
  @IsString()
  @MinLength(9)
  cron!: string;

  @ApiPropertyOptional({ description: "Fixed input passed to every scheduled run" })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
