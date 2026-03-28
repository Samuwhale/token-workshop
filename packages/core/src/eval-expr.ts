/**
 * Safe arithmetic expression evaluator.
 *
 * Supports: +, -, *, /, ** (power), unary -, parentheses.
 * Variables are pre-substituted before parsing.
 * Does NOT use eval() or new Function().
 */
export function evalExpr(expr: string): number {
  const tokens: string[] = [];
  let i = 0;
  const src = expr.replace(/\s+/g, '');

  // Tokenize into numbers and operators
  while (i < src.length) {
    if (/\d/.test(src[i]) || (src[i] === '.' && i + 1 < src.length && /\d/.test(src[i + 1]))) {
      let num = '';
      while (i < src.length && /[\d.]/.test(src[i])) num += src[i++];
      tokens.push(num);
    } else if (src[i] === '*' && src[i + 1] === '*') {
      tokens.push('**');
      i += 2;
    } else if (src[i] === '^') {
      tokens.push('**');
      i++;
    } else if ('+-*/()'.includes(src[i])) {
      tokens.push(src[i++]);
    } else {
      throw new Error(`Unexpected character in formula: ${src[i]}`);
    }
  }

  let pos = 0;

  function peek(): string | undefined { return tokens[pos]; }
  function consume(): string { return tokens[pos++]; }

  function parseExpr(): number { return parseAddSub(); }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePow();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parsePow();
      if (op === '/' && right === 0) throw new Error('Division by zero in formula');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parsePow(): number {
    const base = parseUnary();
    if (peek() === '**') {
      consume();
      const exp = parsePow(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (t === '(') {
      consume();
      const val = parseExpr();
      if (peek() !== ')') throw new Error('Expected )');
      consume();
      return val;
    }
    if (t !== undefined && /^-?\d*\.?\d+$/.test(t)) {
      consume();
      return parseFloat(t);
    }
    throw new Error(`Unexpected token: ${t}`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('Unexpected tokens after expression');
  return result;
}

/**
 * Substitute named variables in a formula string with their numeric values.
 * Throws if any unrecognized variable names remain after substitution.
 */
export function substituteVars(
  formula: string,
  vars: Record<string, number>,
): string {
  const keys = Object.keys(vars);
  let result = formula;
  if (keys.length > 0) {
    // Escape any regex-special chars in key names; sort longest-first to avoid partial matches
    const escaped = keys
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
    result = result.replace(pattern, (match) => String(vars[match] ?? 0));
  }

  // Detect any remaining word-like tokens that look like unresolved variable names
  const remaining = result.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
  if (remaining) {
    const unique = [...new Set(remaining)];
    const available = keys.length > 0 ? ` (available: ${keys.join(', ')})` : '';
    throw new Error(
      `Unknown variable${unique.length > 1 ? 's' : ''} in formula: ${unique.join(', ')}${available}`,
    );
  }

  return result;
}
