import type { KudosPort } from '../ports/kudos.port.js';

/**
 * Stand-in until engagement (E10) provides IF-04. It reports 0 distinct senders, so no
 * kudos badge is earned until then. Swap the provider in growth-core.module.ts.
 */
export class EmptyKudosPort implements KudosPort {
  async distinctApprovedSenders(): Promise<number> {
    return 0;
  }
}
