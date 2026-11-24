import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../identity/decorators/access.decorators.js';
import { sprintValidation } from './dto/base.dto.js';
import {
  BoardQueryDto,
  CarryForwardDto,
  CreateTaskDto,
  HistoryQueryDto,
  TaskOwnerQueryDto,
  UpdateTaskDto,
} from './dto/sprint.dto.js';
import { CurrentActor } from './http/actor.guard.js';
import { SprintHttp } from './http/actor.guard.js';
import { SprintService } from './sprint.service.js';
import type { SprintActor } from './http/actor.js';
import type {
  SprintBoardView,
  SprintHistoryView,
  SprintMeetingBannerView,
  SprintSubmissionView,
  SprintSummaryView,
  SprintTaskView,
  TaskOwnerView,
} from './dto/sprint-response.dto.js';

/**
 * The user-side sprint API (SRS 5.3).
 *
 * Every route runs `SprintHttp()`, which is E01's `JwtAuthGuard` (it checks the token and sets
 * `req.user`), then the sprint actor guard (it turns `req.user` into the caller, 401 when
 * there is nobody), then E01's `RolesGuard` (403 for the wrong role).
 *
 * The controller is thin: it validates the input, takes the caller off the request, and calls
 * the service. It never reads a header, and it never takes a `userId` from the client — the
 * caller is whoever signed in (PRD EP-14).
 */
@Controller('sprint')
@SprintHttp()
@Roles('TRAINEE')
export class SprintController {
  constructor(private readonly sprint: SprintService) {}

  /** U1 — the owners a task can be sent to. */
  @Get('task-owners')
  listTaskOwners(
    @CurrentActor() actor: SprintActor,
    @Query(sprintValidation(TaskOwnerQueryDto)) query: TaskOwnerQueryDto,
  ): Promise<TaskOwnerView[]> {
    return this.sprint.listTaskOwners(actor, query.kind);
  }

  /** U2 — the board of one day, with the tasks that could be carried forward. */
  @Get('board')
  getBoard(
    @CurrentActor() actor: SprintActor,
    @Query(sprintValidation(BoardQueryDto)) query: BoardQueryDto,
  ): Promise<SprintBoardView> {
    return this.sprint.getBoard(actor, query.date);
  }

  /** U3 — create a task. */
  @Post('tasks')
  @HttpCode(201)
  createTask(
    @CurrentActor() actor: SprintActor,
    @Body(sprintValidation(CreateTaskDto)) body: CreateTaskDto,
  ): Promise<SprintTaskView> {
    return this.sprint.createTask(actor, body);
  }

  /** U4 — update one of my own tasks. */
  @Patch('tasks/:id')
  updateTask(
    @CurrentActor() actor: SprintActor,
    @Param('id') id: string,
    @Body(sprintValidation(UpdateTaskDto)) body: UpdateTaskDto,
  ): Promise<SprintTaskView> {
    return this.sprint.updateTask(actor, id, body);
  }

  /** U5 — delete one of my own tasks (a soft delete; the UI asks first). */
  @Delete('tasks/:id')
  @HttpCode(204)
  async deleteTask(@CurrentActor() actor: SprintActor, @Param('id') id: string): Promise<void> {
    await this.sprint.deleteTask(actor, id);
  }

  /** U6 — carry the previous working day's open tasks to this day. */
  @Post('carry-forward')
  @HttpCode(200)
  carryForward(
    @CurrentActor() actor: SprintActor,
    @Body(sprintValidation(CarryForwardDto)) body: CarryForwardDto,
  ): Promise<{ carried: SprintTaskView[] }> {
    return this.sprint.carryForward(actor, body.date);
  }

  /** U7 — submit today's sprint. A second submit on the same day is a 409. */
  @Post('submit')
  @HttpCode(201)
  submit(@CurrentActor() actor: SprintActor): Promise<SprintSubmissionView> {
    return this.sprint.submitSprint(actor);
  }

  /** U8 — the two-week summary. */
  @Get('summary')
  getSummary(@CurrentActor() actor: SprintActor): Promise<SprintSummaryView> {
    return this.sprint.getSummary(actor);
  }
  /** U9 — the history, newest first, one page at a time. */
  @Get('history')
  getHistory(
    @CurrentActor() actor: SprintActor,
    @Query(sprintValidation(HistoryQueryDto)) query: HistoryQueryDto,
  ): Promise<SprintHistoryView> {
    return this.sprint.getHistory(actor, { cursor: query.cursor, limit: query.limit });
  }

  /** U10 — the next meeting, for the banner. `meeting` is null when there is none. */
  @Get('meeting')
  getMeeting(@CurrentActor() actor: SprintActor): Promise<SprintMeetingBannerView> {
    return this.sprint.getMeetingBanner(actor);
  }
}
