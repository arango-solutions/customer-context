// vitest 4 removed the built-in `basic` reporter name (it is now `['default',
// { summary: false }]`). The Phase-6 Plan-01 verify command invokes
// `vitest run --reporter=basic`; this module restores that name as a thin alias so
// the documented verify command keeps working under vitest 4.
import { DefaultReporter } from 'vitest/reporters';

export default class BasicReporter extends DefaultReporter {
  constructor() {
    super({ summary: false });
  }
}
