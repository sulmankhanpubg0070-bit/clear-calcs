import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Delete, History, Trash2 } from "lucide-react";

type Operator = "+" | "-" | "×" | "÷";

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
}

const MAX_DIGITS = 12;

const formatNumber = (value: number): string => {
  if (!isFinite(value)) return "Error";
  if (Number.isNaN(value)) return "Error";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-9 || abs >= 1e12)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }
  const str = parseFloat(value.toPrecision(12)).toString();
  return str.length > MAX_DIGITS + 2 ? value.toPrecision(8) : str;
};

const compute = (a: number, b: number, op: Operator): number => {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      if (b === 0) return NaN;
      return a / b;
  }
};

const Calculator = () => {
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [expression, setExpression] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [errored, setErrored] = useState(false);

  const resetAll = () => {
    setDisplay("0");
    setPrevious(null);
    setOperator(null);
    setWaitingForOperand(false);
    setExpression("");
    setErrored(false);
  };

  const inputDigit = (digit: string) => {
    if (errored) resetAll();
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
      return;
    }
    if (display.replace(/[-.]/g, "").length >= MAX_DIGITS) return;
    setDisplay(display === "0" ? digit : display + digit);
  };

  const inputDecimal = () => {
    if (errored) resetAll();
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes(".")) setDisplay(display + ".");
  };

  const backspace = () => {
    if (errored) {
      resetAll();
      return;
    }
    if (waitingForOperand) return;
    if (display.length <= 1 || (display.length === 2 && display.startsWith("-"))) {
      setDisplay("0");
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const toggleSign = () => {
    if (errored || display === "0") return;
    setDisplay(display.startsWith("-") ? display.slice(1) : "-" + display);
  };

  const percent = () => {
    if (errored) return;
    const v = parseFloat(display);
    if (isNaN(v)) return;
    setDisplay(formatNumber(v / 100));
  };

  const performOperation = (nextOp: Operator) => {
    if (errored) return;
    const current = parseFloat(display);
    if (isNaN(current)) return;

    if (previous === null) {
      setPrevious(current);
    } else if (!waitingForOperand && operator) {
      const result = compute(previous, current, operator);
      if (!isFinite(result) || isNaN(result)) {
        setDisplay("Cannot divide by zero");
        setErrored(true);
        setPrevious(null);
        setOperator(null);
        setExpression("");
        return;
      }
      const formatted = formatNumber(result);
      setDisplay(formatted);
      setPrevious(result);
    }

    setOperator(nextOp);
    setWaitingForOperand(true);
    setExpression(
      `${formatNumber(previous ?? current)} ${nextOp}`,
    );
  };

  const equals = () => {
    if (errored || previous === null || operator === null) return;
    const current = parseFloat(display);
    if (isNaN(current)) return;
    const result = compute(previous, current, operator);
    const expr = `${formatNumber(previous)} ${operator} ${formatNumber(current)}`;

    if (!isFinite(result) || isNaN(result)) {
      setDisplay("Cannot divide by zero");
      setErrored(true);
      setPrevious(null);
      setOperator(null);
      setExpression("");
      return;
    }

    const formatted = formatNumber(result);
    setHistory((h) =>
      [{ id: crypto.randomUUID(), expression: expr, result: formatted }, ...h].slice(0, 30),
    );
    setDisplay(formatted);
    setExpression(`${expr} =`);
    setPrevious(null);
    setOperator(null);
    setWaitingForOperand(true);
  };

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") return inputDigit(e.key);
      if (e.key === ".") return inputDecimal();
      if (e.key === "+" || e.key === "-") return performOperation(e.key);
      if (e.key === "*") return performOperation("×");
      if (e.key === "/") {
        e.preventDefault();
        return performOperation("÷");
      }
      if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        return equals();
      }
      if (e.key === "Backspace") return backspace();
      if (e.key === "Escape") return resetAll();
      if (e.key === "%") return percent();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display, previous, operator, waitingForOperand, errored],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const useHistoryValue = (value: string) => {
    setDisplay(value);
    setPrevious(null);
    setOperator(null);
    setWaitingForOperand(false);
    setExpression("");
    setErrored(false);
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6 overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-primary/30 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-accent/30 blur-[100px]" />

      {/* Display */}
      <section
        aria-label="Calculator display"
        className="relative z-10 rounded-3xl bg-card p-6 border border-border/60"
      >
        <div className="min-h-6 text-right text-sm font-medium text-muted-foreground tabular-nums truncate">
          {expression || "\u00A0"}
        </div>
        <div
          className={cn(
            "mt-2 text-right font-semibold tabular-nums tracking-tight break-all",
            errored
              ? "text-destructive text-3xl"
              : "text-foreground text-5xl sm:text-6xl drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]",
          )}
          aria-live="polite"
        >
          {display}
        </div>
      </section>

      {/* Keypad */}
      <section aria-label="Calculator keypad" className="relative z-10 grid grid-cols-4 gap-3">
        <CalcKey variant="function" onClick={resetAll} ariaLabel="Clear">
          AC
        </CalcKey>
        <CalcKey variant="function" onClick={toggleSign} ariaLabel="Toggle sign">
          +/−
        </CalcKey>
        <CalcKey variant="function" onClick={percent} ariaLabel="Percent">
          %
        </CalcKey>
        <CalcKey variant="operator" onClick={() => performOperation("÷")} ariaLabel="Divide">
          ÷
        </CalcKey>

        <CalcKey variant="digit" onClick={() => inputDigit("7")}>7</CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("8")}>8</CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("9")}>9</CalcKey>
        <CalcKey variant="operator" onClick={() => performOperation("×")} ariaLabel="Multiply">×</CalcKey>

        <CalcKey variant="digit" onClick={() => inputDigit("4")}>4</CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("5")}>5</CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("6")}>6</CalcKey>
        <CalcKey variant="operator" onClick={() => performOperation("-")} ariaLabel="Subtract">−</CalcKey>

        <CalcKey variant="digit" onClick={() => inputDigit("1")}>1</CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("2")}>2</CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("3")}>3</CalcKey>
        <CalcKey variant="operator" onClick={() => performOperation("+")} ariaLabel="Add">+</CalcKey>

        <CalcKey variant="digit" onClick={backspace} ariaLabel="Backspace">
          <Delete className="h-6 w-6" />
        </CalcKey>
        <CalcKey variant="digit" onClick={() => inputDigit("0")}>0</CalcKey>
        <CalcKey variant="digit" onClick={inputDecimal} ariaLabel="Decimal point">.</CalcKey>
        <CalcKey variant="equals" onClick={equals} ariaLabel="Equals">=</CalcKey>
      </section>

      {/* History */}
      <section aria-label="Calculation history" className="relative z-10 rounded-3xl bg-card border border-border/60 p-4">
        <header className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="h-4 w-4" />
            History
          </div>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistory([])}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </header>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No calculations yet
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => useHistoryValue(h.result)}
                  className="group flex w-full flex-col items-end rounded-xl px-3 py-2 text-right transition-colors hover:bg-accent/60 active:bg-accent"
                >
                  <span className="text-xs text-muted-foreground">{h.expression}</span>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    = {h.result}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

interface CalcKeyProps {
  variant: "digit" | "operator" | "function" | "equals";
  onClick: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}

const CalcKey = ({ variant, onClick, ariaLabel, children }: CalcKeyProps) => {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "h-16 sm:h-18 rounded-2xl text-2xl font-medium tabular-nums",
        "flex items-center justify-center select-none",
        "transition-all duration-100",
        "active:scale-95 active:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        variant === "digit" && "bg-digit text-digit-foreground hover:bg-digit/70",
        variant === "function" &&
          "bg-function-key text-function-key-foreground hover:bg-function-key/80 font-bold",
        variant === "operator" &&
          "bg-operator text-operator-foreground hover:bg-primary-glow font-semibold shadow-[var(--shadow-key)]",
        variant === "equals" &&
          "bg-equals text-equals-foreground hover:brightness-110 font-bold shadow-[var(--shadow-equals)]",
      )}
    >
      {children}
    </button>
  );
};

export default Calculator;