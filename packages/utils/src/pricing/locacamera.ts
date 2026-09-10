const DAY_MS = 24 * 60 * 60 * 1000;

export type LocaCameraRentalType = "daily" | "half";
export type LocaCameraHalfDayTurn = "day" | "night" | "";

export type LocaCameraPricingRule = {
  units: number;
  code:
    | "DIARIA_PADRAO"
    | "MEIA_DIARIA_DIA"
    | "MEIA_DIARIA_NOITE"
    | "FIM_SEMANA_SEXTA_SABADO"
    | "FIM_SEMANA_SEXTA_SEGUNDA"
    | "FIM_SEMANA_SABADO_SEGUNDA";
  label: string;
};

type ParsedDateTime = {
  date: Date;
  year: number;
  month: number;
  day: number;
  minutes: number;
};

export function parseLocaCameraRentalDateTime(value: string): ParsedDateTime | null {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute);

  if (Number.isNaN(date.getTime())) return null;

  return {
    date,
    year,
    month,
    day,
    minutes: hour * 60 + minute,
  };
}

function calendarDayDifference(start: ParsedDateTime, end: ParsedDateTime) {
  return Math.round(
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
      DAY_MS,
  );
}

export function calculateLocaCameraPricingRule(
  pickup: string,
  returning: string,
  rentalType: LocaCameraRentalType = "daily",
  halfDayTurn: LocaCameraHalfDayTurn = "",
): LocaCameraPricingRule {
  const start = parseLocaCameraRentalDateTime(pickup);
  const end = parseLocaCameraRentalDateTime(returning);

  if (!start || !end || end.date <= start.date) {
    throw new Error("Período inválido para cálculo de preço.");
  }

  if (rentalType === "half") {
    if (halfDayTurn !== "day" && halfDayTurn !== "night") {
      throw new Error("Turno da meia diária não informado.");
    }

    return {
      units: 0.5,
      code: halfDayTurn === "night" ? "MEIA_DIARIA_NOITE" : "MEIA_DIARIA_DIA",
      label:
        halfDayTurn === "night"
          ? "Meia diária — turno da noite"
          : "Meia diária — turno do dia",
    };
  }

  const startWeekDay = start.date.getDay();
  const endWeekDay = end.date.getDay();
  const calendarDays = calendarDayDifference(start, end);

  if (startWeekDay === 5 && endWeekDay === 1 && calendarDays === 3) {
    return {
      units: 2,
      code: "FIM_SEMANA_SEXTA_SEGUNDA",
      label: "Fim de semana — sexta a segunda",
    };
  }

  if (startWeekDay === 6 && endWeekDay === 1 && calendarDays === 2) {
    return {
      units: 1.5,
      code: "FIM_SEMANA_SABADO_SEGUNDA",
      label: "Fim de semana — sábado a segunda",
    };
  }

  if (
    startWeekDay === 5 &&
    endWeekDay === 6 &&
    calendarDays === 1 &&
    end.minutes <= 12 * 60
  ) {
    return {
      units: 1,
      code: "FIM_SEMANA_SEXTA_SABADO",
      label: "Fim de semana — sexta a sábado",
    };
  }

  return {
    units: Math.max(1, Math.ceil((end.date.getTime() - start.date.getTime()) / DAY_MS)),
    code: "DIARIA_PADRAO",
    label: "Diária padrão",
  };
}

export function calculateLocaCameraRentalTotal(input: {
  dailyPrice: number;
  quantity: number;
  pickup: string;
  returning: string;
  rentalType?: LocaCameraRentalType;
  halfDayTurn?: LocaCameraHalfDayTurn;
}) {
  const dailyPrice = Math.max(0, Number(input.dailyPrice || 0));
  const quantity = Math.max(1, Math.round(Number(input.quantity || 1)));
  const rule = calculateLocaCameraPricingRule(
    input.pickup,
    input.returning,
    input.rentalType || "daily",
    input.halfDayTurn || "",
  );

  return {
    dailyPrice,
    quantity,
    units: rule.units,
    ruleCode: rule.code,
    ruleLabel: rule.label,
    total: Number((dailyPrice * rule.units * quantity).toFixed(2)),
  };
}

export function validateLocaCameraRentalPricingPeriod(input: {
  pickup: string;
  returning: string;
  rentalType?: LocaCameraRentalType;
  halfDayTurn?: LocaCameraHalfDayTurn;
}) {
  const rentalType = input.rentalType || "daily";
  const halfDayTurn = input.halfDayTurn || "";

  if (rentalType !== "half") return { ok: true as const };

  const start = parseLocaCameraRentalDateTime(input.pickup);
  const end = parseLocaCameraRentalDateTime(input.returning);

  if (!start || !end || end.date <= start.date) {
    return {
      ok: false as const,
      code: "HALF_DAY_PERIOD_INVALID",
      message: "O período da Meia Diária é inválido.",
    };
  }

  const startWeekDay = start.date.getDay();

  if (startWeekDay < 1 || startWeekDay > 4) {
    return {
      ok: false as const,
      code: "HALF_DAY_WEEKDAY_INVALID",
      message: "A Meia Diária está disponível de segunda a quinta.",
    };
  }

  const dayDifference = calendarDayDifference(start, end);

  if (halfDayTurn === "day") {
    const valid =
      dayDifference === 0 &&
      start.minutes >= 9 * 60 &&
      start.minutes < 17 * 60 &&
      end.minutes > start.minutes &&
      end.minutes <= 17 * 60;

    return valid
      ? { ok: true as const }
      : {
          ok: false as const,
          code: "HALF_DAY_DAY_INVALID",
          message: "No turno do dia, a locação deve acontecer entre 09:00 e 17:00.",
        };
  }

  if (halfDayTurn === "night") {
    const valid =
      dayDifference === 1 &&
      start.minutes >= 17 * 60 &&
      start.minutes <= 18 * 60 &&
      end.minutes <= 9 * 60;

    return valid
      ? { ok: true as const }
      : {
          ok: false as const,
          code: "HALF_DAY_NIGHT_INVALID",
          message:
            "No turno da noite, retire entre 17:00 e 18:00 e devolva até 09:00 do dia seguinte.",
        };
  }

  return {
    ok: false as const,
    code: "HALF_DAY_TURN_REQUIRED",
    message: "Escolha o turno da Meia Diária.",
  };
}
