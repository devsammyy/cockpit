import { Module, Global } from "@nestjs/common";
import {
  InMemoryShortTermMemory,
  DbLongTermMemory,
  DbSemanticMemory,
  InMemorySessionMemory,
} from "./memory.service";
import { ContextBuilderService } from "./context-builder.service";
import { ReflectionEngineService } from "./reflection-engine.service";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { MemoryController } from "./memory.controller";
import {
  SHORT_TERM_MEMORY,
  LONG_TERM_MEMORY,
  SEMANTIC_MEMORY,
  SESSION_MEMORY,
} from "./memory.interface";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: SHORT_TERM_MEMORY,
      useClass: InMemoryShortTermMemory,
    },
    {
      provide: LONG_TERM_MEMORY,
      useClass: DbLongTermMemory,
    },
    {
      provide: SEMANTIC_MEMORY,
      useClass: DbSemanticMemory,
    },
    {
      provide: SESSION_MEMORY,
      useClass: InMemorySessionMemory,
    },
    ContextBuilderService,
    ReflectionEngineService,
  ],
  controllers: [MemoryController],
  exports: [
    SHORT_TERM_MEMORY,
    LONG_TERM_MEMORY,
    SEMANTIC_MEMORY,
    SESSION_MEMORY,
    ContextBuilderService,
    ReflectionEngineService,
  ],
})
export class MemoryModule {}
