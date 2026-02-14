/**
 * Telegram auth (Phase A).
 *
 * Сейчас: упрощённо принимаем telegram_user_id из тела запроса.
 * Позже: verify Telegram initData HMAC.
 */

const Auth_ = (() => {

  function authenticate_(auth, flags) {
    if (!flags.isOn(FLAG.AUTH_TELEGRAM)) return null;

    const telegramUserId = String((auth && auth.telegram_user_id) || '').trim();
    if (!telegramUserId) return null;

    // employees: employee_id, full_name, telegram_user_id, role, is_active, ...
    const emp = Db_.findBy_(SHEET.EMPLOYEES, 'telegram_user_id', telegramUserId);
    if (!emp) return null;
    if (String(emp.is_active) !== 'TRUE') return null;

    return {
      employee_id: emp.employee_id,
      full_name: emp.full_name,
      role: emp.role,
      telegram_user_id: telegramUserId,
      default_station_id: emp.default_station_id || '',
    };
  }

  return { authenticate_ };
})();
