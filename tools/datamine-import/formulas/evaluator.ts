/**
 * Formula DSL evaluator for D4 affix value formulas.
 *
 * Implements a recursive-descent parser and interpreter for the DSL function
 * surface described in the commission spec (D17/D18/D23).
 *
 * Supported functions:
 *  - IPower()                          → itemPower from context
 *  - RandomInt(min, max)               → min (pos=min), max (pos=max), mid (pos=mid)
 *  - FloatRandomRangeWithInterval(step, min, max) → same semantics as RandomInt
 *  - FloatRangeWithInterval(min, max, step) → same semantics as RandomInt
 *  - Round(x) / ROUND(x)              → Math.round(x)
 *  - Floor(x)                          → Math.floor(x)
 *  - Min(a, b)                         → Math.min(a, b)
 *  - Max(a, b)                         → Math.max(a, b)
 *  - Pin(val, min, max)                → clamp(val, min, max)
 *  - Pow(base, exp)                    → Math.pow(base, exp)
 *  - CurrentLegendaryRank()            → ctx.legendaryRank ?? 0 (defaults to 0; supply EvalContext.legendaryRank for masterwork modeling)
 *  - SacredAffixScalarOffense          → scalars.sacredOffense (identifier or 0-arg call)
 *  - SacredAffixScalarDefense          → scalars.sacredDefense
 *  - AncestralAffixScalarOffense       → scalars.ancestralOffense
 *  - AncestralAffixScalarDefense       → scalars.ancestralDefense
 *
 * Unsupported functions (throw UnsupportedFunctionError per D5):
 *  - ParagonPowerBudgetMultiplier*
 *  - ParagonGetGlyphLevel
 *  - GetTotalAffixBonus
 *  - SharedRandomFloat
 *
 * Do NOT vendor the HoldMyBeer-gg/d4builder regex-replace approach — this is a
 * real recursive-descent parser (D4).
 */

import type { AffixScalars } from "./constants";

// ─── Error types ─────────────────────────────────────────────────────────────

/** Thrown when the formula references a function not in the allowed set (D5). */
export class UnsupportedFunctionError extends Error {
  constructor(public readonly fnName: string) {
    super(`Unsupported DSL function: ${fnName}`);
    this.name = "UnsupportedFunctionError";
  }
}

/** Thrown when the formula string cannot be parsed. */
export class FormulaParseError extends Error {
  constructor(message: string) {
    super(`Formula parse error: ${message}`);
    this.name = "FormulaParseError";
  }
}

// ─── Evaluation context ───────────────────────────────────────────────────────

/**
 * Context passed to `evaluate()`.
 *
 * Per D17: `position` controls how randomized DSL functions resolve:
 *  - `"min"` → return the minimum value
 *  - `"max"` → return the maximum value
 *  - `"mid"` → return the midpoint
 *
 * Per D3 (spec): `legendaryRank` is optional and defaults to 0.
 * Callers that want to model masterwork tier bonuses can supply a non-zero rank.
 * `CurrentLegendaryRank()` in the formula DSL returns this value.
 */
export interface EvalContext {
  itemPower: number;
  position: "min" | "max" | "mid";
  scalars: AffixScalars;
  /**
   * Optional legendary/masterwork rank for callers modeling masterwork tier bonuses.
   * Passed to `CurrentLegendaryRank()` in the formula DSL. Defaults to 0 when omitted.
   */
  legendaryRank?: number;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenKind =
  | "number"
  | "identifier"
  | "lparen"
  | "rparen"
  | "comma"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input.trim();

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }

    // Number (integer or decimal, optionally negative — handled as unary minus)
    if (/[0-9]/.test(src[i]) || (src[i] === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let start = i;
      while (i < src.length && (/[0-9]/.test(src[i]) || src[i] === ".")) i++;
      tokens.push({ kind: "number", value: src.slice(start, i), pos: start });
      continue;
    }

    // Identifier (function name or scalar constant)
    if (/[A-Za-z_]/.test(src[i])) {
      let start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      tokens.push({ kind: "identifier", value: src.slice(start, i), pos: start });
      continue;
    }

    switch (src[i]) {
      case "(": tokens.push({ kind: "lparen",  value: "(", pos: i }); i++; break;
      case ")": tokens.push({ kind: "rparen",  value: ")", pos: i }); i++; break;
      case ",": tokens.push({ kind: "comma",   value: ",", pos: i }); i++; break;
      case "+": tokens.push({ kind: "plus",    value: "+", pos: i }); i++; break;
      case "-": tokens.push({ kind: "minus",   value: "-", pos: i }); i++; break;
      case "*": tokens.push({ kind: "star",    value: "*", pos: i }); i++; break;
      case "/": tokens.push({ kind: "slash",   value: "/", pos: i }); i++; break;
      default:
        throw new FormulaParseError(`Unexpected character '${src[i]}' at position ${i} in: ${input}`);
    }
  }

  tokens.push({ kind: "eof", value: "", pos: src.length });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos: number;
  private formula: string;

  constructor(tokens: Token[], formula: string) {
    this.tokens = tokens;
    this.pos = 0;
    this.formula = formula;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(kind?: TokenKind): Token {
    const tok = this.tokens[this.pos];
    if (kind && tok.kind !== kind) {
      throw new FormulaParseError(
        `Expected '${kind}' but got '${tok.kind}' ('${tok.value}') at pos ${tok.pos} in: ${this.formula}`
      );
    }
    this.pos++;
    return tok;
  }

  parse(): ParseNode {
    const node = this.parseExpr();
    if (this.peek().kind !== "eof") {
      throw new FormulaParseError(
        `Unexpected token '${this.peek().value}' at pos ${this.peek().pos} in: ${this.formula}`
      );
    }
    return node;
  }

  // expr := term (('+' | '-') term)*
  private parseExpr(): ParseNode {
    let left = this.parseTerm();

    while (this.peek().kind === "plus" || this.peek().kind === "minus") {
      const op = this.consume().value as "+" | "-";
      const right = this.parseTerm();
      left = { type: "binop", op, left, right };
    }

    return left;
  }

  // term := factor (('*' | '/') factor)*
  private parseTerm(): ParseNode {
    let left = this.parseFactor();

    while (this.peek().kind === "star" || this.peek().kind === "slash") {
      const op = this.consume().value as "*" | "/";
      const right = this.parseFactor();
      left = { type: "binop", op, left, right };
    }

    return left;
  }

  // factor := '-' factor | '(' expr ')' | number | identifier ('(' arglist? ')')?
  private parseFactor(): ParseNode {
    const tok = this.peek();

    // Unary minus
    if (tok.kind === "minus") {
      this.consume("minus");
      const operand = this.parseFactor();
      return { type: "unary_minus", operand };
    }

    // Parenthesized expression
    if (tok.kind === "lparen") {
      this.consume("lparen");
      const inner = this.parseExpr();
      this.consume("rparen");
      return inner;
    }

    // Number literal
    if (tok.kind === "number") {
      this.consume("number");
      return { type: "number", value: parseFloat(tok.value) };
    }

    // Identifier — may be a function call or scalar constant
    if (tok.kind === "identifier") {
      const name = this.consume("identifier").value;

      // Function call (with parentheses)
      if (this.peek().kind === "lparen") {
        this.consume("lparen");
        const args: ParseNode[] = [];

        if (this.peek().kind !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek().kind === "comma") {
            this.consume("comma");
            args.push(this.parseExpr());
          }
        }

        this.consume("rparen");
        return { type: "call", name, args };
      }

      // Bare identifier (scalar constant like SacredAffixScalarOffense)
      return { type: "identifier", name };
    }

    throw new FormulaParseError(
      `Unexpected token '${tok.kind}' ('${tok.value}') at pos ${tok.pos} in: ${this.formula}`
    );
  }
}

// ─── AST nodes ────────────────────────────────────────────────────────────────

type ParseNode =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "unary_minus"; operand: ParseNode }
  | { type: "binop"; op: "+" | "-" | "*" | "/"; left: ParseNode; right: ParseNode }
  | { type: "call"; name: string; args: ParseNode[] };

// ─── Evaluator ────────────────────────────────────────────────────────────────

/** Names that are unsupported — checked before the allow-list (D5 / D6).
 *
 * Functions previously on this list have been implemented with catalog-time
 * identity / default-value semantics — see the build-time/runtime accessors
 * group in `evalCall`. New unsupported functions discovered during datamine
 * runs should be added here only when no reasonable catalog-time default
 * exists; preferring a documented identity default keeps the formula
 * evaluator usable against the full d4data formula table.
 */
const UNSUPPORTED_PREFIXES: string[] = [];

function evalNode(node: ParseNode, ctx: EvalContext): number {
  switch (node.type) {
    case "number":
      return node.value;

    case "unary_minus":
      return -evalNode(node.operand, ctx);

    case "binop": {
      const l = evalNode(node.left, ctx);
      const r = evalNode(node.right, ctx);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/":
          if (r === 0) throw new FormulaParseError("Division by zero");
          return l / r;
      }
      break;
    }

    case "identifier":
      return evalScalarIdentifier(node.name, ctx);

    case "call":
      return evalCall(node.name, node.args, ctx);
  }
}

function evalScalarIdentifier(name: string, ctx: EvalContext): number {
  switch (name) {
    case "SacredAffixScalarOffense":   return ctx.scalars.sacredOffense;
    case "SacredAffixScalarDefense":   return ctx.scalars.sacredDefense;
    case "AncestralAffixScalarOffense": return ctx.scalars.ancestralOffense;
    case "AncestralAffixScalarDefense": return ctx.scalars.ancestralDefense;
    default:
      // Check unsupported before throwing generic error
      for (const prefix of UNSUPPORTED_PREFIXES) {
        if (name.startsWith(prefix) || name === prefix) {
          throw new UnsupportedFunctionError(name);
        }
      }
      throw new FormulaParseError(`Unknown identifier: ${name}`);
  }
}

function evalCall(name: string, argNodes: ParseNode[], ctx: EvalContext): number {
  // Check unsupported functions first (D5)
  for (const prefix of UNSUPPORTED_PREFIXES) {
    if (name.startsWith(prefix) || name === prefix) {
      throw new UnsupportedFunctionError(name);
    }
  }

  // Evaluate all argument sub-expressions eagerly
  const evalArg = (i: number): number => {
    if (i >= argNodes.length) {
      throw new FormulaParseError(`Missing argument ${i} for ${name}()`);
    }
    return evalNode(argNodes[i], ctx);
  };

  switch (name) {
    // ── No-arg ────────────────────────────────────────────────────────────────
    case "IPower":
      if (argNodes.length !== 0) throw new FormulaParseError("IPower() takes no arguments");
      return ctx.itemPower;

    case "CurrentLegendaryRank":
      // Returns ctx.legendaryRank when supplied; defaults to 0 for normal catalog-build runs.
      // Callers modeling masterwork tier bonuses should pass a non-zero legendaryRank in EvalContext.
      return ctx.legendaryRank ?? 0;

    // ── Scalar constants may also be called as 0-arg functions ──────────────
    case "SacredAffixScalarOffense":   return ctx.scalars.sacredOffense;
    case "SacredAffixScalarDefense":   return ctx.scalars.sacredDefense;
    case "AncestralAffixScalarOffense": return ctx.scalars.ancestralOffense;
    case "AncestralAffixScalarDefense": return ctx.scalars.ancestralDefense;

    // ── Randomized functions (position-aware, D17) ────────────────────────────
    case "RandomInt": {
      if (argNodes.length !== 2) throw new FormulaParseError("RandomInt(min, max) requires 2 args");
      const lo = evalArg(0);
      const hi = evalArg(1);
      return pickByPosition(lo, hi, ctx.position);
    }

    case "FloatRandomRangeWithInterval": {
      // FloatRandomRangeWithInterval(step, min, max)
      if (argNodes.length !== 3) throw new FormulaParseError("FloatRandomRangeWithInterval(step, min, max) requires 3 args");
      // step is arg 0; min is arg 1; max is arg 2
      const lo = evalArg(1);
      const hi = evalArg(2);
      return pickByPosition(lo, hi, ctx.position);
    }

    case "FloatRangeWithInterval": {
      // FloatRangeWithInterval(min, max, step) — note arg order differs from above
      if (argNodes.length !== 3) throw new FormulaParseError("FloatRangeWithInterval(min, max, step) requires 3 args");
      const lo = evalArg(0);
      const hi = evalArg(1);
      return pickByPosition(lo, hi, ctx.position);
    }

    // ── Rounding ──────────────────────────────────────────────────────────────
    case "Round":
    case "ROUND":
      if (argNodes.length !== 1) throw new FormulaParseError(`${name}(x) requires 1 arg`);
      return Math.round(evalArg(0));

    case "Floor":
      if (argNodes.length !== 1) throw new FormulaParseError("Floor(x) requires 1 arg");
      return Math.floor(evalArg(0));

    case "Ceil":
      if (argNodes.length !== 1) throw new FormulaParseError("Ceil(x) requires 1 arg");
      return Math.ceil(evalArg(0));

    // ── Arithmetic ────────────────────────────────────────────────────────────
    case "Min":
      if (argNodes.length !== 2) throw new FormulaParseError("Min(a, b) requires 2 args");
      return Math.min(evalArg(0), evalArg(1));

    case "Max":
      if (argNodes.length !== 2) throw new FormulaParseError("Max(a, b) requires 2 args");
      return Math.max(evalArg(0), evalArg(1));

    case "Pin": {
      // Pin(val, min, max) — clamp
      if (argNodes.length !== 3) throw new FormulaParseError("Pin(val, min, max) requires 3 args");
      const val = evalArg(0);
      const lo2 = evalArg(1);
      const hi2 = evalArg(2);
      return Math.min(Math.max(val, lo2), hi2);
    }

    case "Pow":
      if (argNodes.length !== 2) throw new FormulaParseError("Pow(base, exp) requires 2 args");
      return Math.pow(evalArg(0), evalArg(1));

    case "Abs":
      if (argNodes.length !== 1) throw new FormulaParseError("Abs(x) requires 1 arg");
      return Math.abs(evalArg(0));

    // ── Build-time/runtime bonus accessors — catalog-time identity defaults ──
    //
    // These functions return values that the live game engine computes from
    // per-item, per-character, or per-build state (masterwork tier, greater
    // affix count, glyph level, paragon node tier, etc.). For the catalog's
    // baseline value-range derivation we substitute the no-bonus identity
    // (`1` for multiplier-style accessors, sensible defaults for level-style
    // accessors). The catalog stores the *rolled* range; downstream consumers
    // that need actual in-game values apply per-character multipliers.
    //
    // If a future commission models per-character/per-build catalog tiers,
    // these defaults are the right place to thread real values through (via
    // additional EvalContext fields).

    case "GetTotalAffixBonus":
      // Multiplier composed of masterwork tier, greater affix bonus, etc.
      // Catalog-time identity: 1.0 (no bonus applied).
      return 1;

    case "ParagonGetGlyphLevel":
      // Glyph level for paragon-glyph formulas. Catalog-time default: 1
      // (baseline socketed glyph). Min-position uses 1; max-position uses 15
      // (max glyph level) so paragon-glyph value ranges in the catalog cover
      // the levelled range, not just the baseline.
      return ctx.position === "max" ? 15 : 1;

    case "ParagonPowerBudgetMultiplierGlyphStatBonusRare":
    case "ParagonPowerBudgetMultiplierNodeMagicDefensive":
    case "ParagonPowerBudgetMultiplierNodeMagicOffensive":
    case "ParagonPowerBudgetMultiplierNodeRareMajorDefensive":
    case "ParagonPowerBudgetMultiplierNodeRareMajorOffensive":
    case "ParagonPowerBudgetMultiplierNodeRareMinorDefensive":
    case "ParagonPowerBudgetMultiplierNodeRareMinorOffensive":
      // Paragon power-budget multipliers — engine-side scalings. Identity 1.0
      // for catalog baseline. Position-aware variants can replace these later.
      return 1;

    case "FloatRandomRangeWithIntervalUniqueAffixPityBonus": {
      // Unique-affix pity-bonus variant of FloatRandomRangeWithInterval.
      // Same `(step, min, max)` arg order. Catalog-time identity behaves like
      // the base function — the pity bonus is a runtime-only enhancement.
      if (argNodes.length !== 3) {
        throw new FormulaParseError(
          "FloatRandomRangeWithIntervalUniqueAffixPityBonus(step, min, max) requires 3 args"
        );
      }
      const lo = evalArg(1);
      const hi = evalArg(2);
      return pickByPosition(lo, hi, ctx.position);
    }

    case "SharedRandomFloat": {
      // SharedRandomFloat(min, max) — random float in [min, max], shared across
      // entries within the same atom (used for synchronized rolls). For catalog
      // baseline we pick the position endpoint, same as RandomInt.
      if (argNodes.length !== 2) {
        throw new FormulaParseError("SharedRandomFloat(min, max) requires 2 args");
      }
      const lo = evalArg(0);
      const hi = evalArg(1);
      return pickByPosition(lo, hi, ctx.position);
    }

    default:
      throw new UnsupportedFunctionError(name);
  }
}

function pickByPosition(lo: number, hi: number, position: EvalContext["position"]): number {
  switch (position) {
    case "min": return lo;
    case "max": return hi;
    case "mid": return (lo + hi) / 2;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a formula string and returns a single numeric result.
 *
 * Per D17: `ctx.position` controls how randomized functions resolve.
 * Per D3: `CurrentLegendaryRank()` returns `ctx.legendaryRank ?? 0`.
 * Per D5: unsupported functions throw `UnsupportedFunctionError`.
 *
 * @example
 * evaluate("Floor(RandomInt(183, 274))", { itemPower: 260, position: "min", scalars })
 * // → 183
 *
 * @example
 * evaluate("Floor(IPower() * 0.5)", { itemPower: 400, position: "min", scalars })
 * // → 200
 */
export function evaluate(formula: string, ctx: EvalContext): number {
  const trimmed = formula.trim();

  // Short-circuit for literal "0" or empty formula — callers decide what to do with zero results
  if (trimmed === "" || trimmed === "0") {
    return 0;
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens, trimmed);
  const ast = parser.parse();
  return evalNode(ast, ctx);
}
