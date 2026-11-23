/**
 * Email normalisation (E01).
 *
 * Every email that enters or is looked up by the identity module goes
 * through this one function, so `Name@Company.com ` and `name@company.com`
 * are always the same account.
 *
 * Pure function (no Nest, no database) so it is easy to unit test.
 */
export function normalizeEmail(raw: string): string {
    return raw.trim().toLowerCase();
}
