import React, { useEffect, useMemo, useState } from 'react';

// Form values for the launch checker
interface FormValues {
  marketplace: 'US' | 'UK' | 'DE' | 'Other';
  category: 'Home & Kitchen' | 'Beauty' | 'Sports' | 'Other';
  targetPrice: number;
  ddpCost: number;
  sizeClass: 'Small standard' | 'Large standard' | 'Oversize';
  totalBudget: number;
  initialUnits: number;
  monthlyAdBudget: number;
  monthsNegative: number;
  competition: 'Low' | 'Medium' | 'High';
}

type ScenarioKey = 'Safe' | 'Base' | 'Aggressive';

interface ScenarioResult {
  conversionRate: number;
  clicksPerMonth: number;
  ordersPerMonth: number;
  adCostPerSale: number;
  profitAfterAds: number;
  staysPositive: boolean;
  lowestCash: number;
}

// Hardcoded assumptions (easy to tweak later)
const REFERRAL_RATE = 0.15;
const FBA_FEES: Record<FormValues['sizeClass'], number> = {
  'Small standard': 4,
  'Large standard': 5.5,
  Oversize: 8,
};
const CPC_BY_COMPETITION: Record<FormValues['competition'], number> = {
  Low: 0.55,
  Medium: 1,
  High: 1.6,
};
const CONVERSION_RATES: Record<ScenarioKey, number> = {
  Safe: 0.03,
  Base: 0.08,
  Aggressive: 0.12,
};

const defaultValues: FormValues = {
  marketplace: 'US',
  category: 'Home & Kitchen',
  targetPrice: 25,
  ddpCost: 7,
  sizeClass: 'Small standard',
  totalBudget: 12000,
  initialUnits: 500,
  monthlyAdBudget: 1500,
  monthsNegative: 4,
  competition: 'Medium',
};

const storageKey = 'amazon-launch-checker-form';

// Helper to keep numeric input non-negative and finite
const sanitizeNumber = (value: string) => {
  const asNumber = Number(value);
  if (Number.isNaN(asNumber) || !Number.isFinite(asNumber)) return 0;
  return Math.max(0, asNumber);
};

const currency = (amount: number) =>
  amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

const ResultBadge: React.FC<{ label: string; tone: 'green' | 'amber' | 'red' }>
= ({ label, tone }) => {
  const colors: Record<typeof tone, string> = {
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-rose-100 text-rose-800 border-rose-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${colors[tone]}`}
    >
      {label}
    </span>
  );
};

const App: React.FC = () => {
  const [values, setValues] = useState<FormValues>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return { ...defaultValues, ...JSON.parse(saved) } as FormValues;
      } catch (error) {
        console.warn('Could not parse saved form data', error);
      }
    }
    return defaultValues;
  });
  const [results, setResults] = useState<Record<ScenarioKey, ScenarioResult> | null>(null);
  const [verdict, setVerdict] = useState<string>('');
  const [verdictTone, setVerdictTone] = useState<'green' | 'amber' | 'red'>('green');
  const [error, setError] = useState<string>('');

  // Persist the form for convenience
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(values));
  }, [values]);

  const amazonFees = useMemo(
    () => values.targetPrice * REFERRAL_RATE + FBA_FEES[values.sizeClass],
    [values.targetPrice, values.sizeClass],
  );

  const grossProfitPerUnit = useMemo(
    () => values.targetPrice - values.ddpCost - amazonFees,
    [amazonFees, values.ddpCost, values.targetPrice],
  );

  // Main calculation
  const handleCalculate = () => {
    setError('');

    // Basic validation
    if (values.targetPrice === 0 || values.ddpCost === 0) {
      setError('Target price and DDP cost must be greater than 0.');
      return;
    }
    if (values.monthsNegative < 1) {
      setError('Months willing to be negative should be at least 1.');
      return;
    }
    if (values.initialUnits === 0) {
      setError('Initial units should be greater than 0 to simulate inventory.');
      return;
    }

    const selectedCpc = CPC_BY_COMPETITION[values.competition];
    const scenarioResults: Record<ScenarioKey, ScenarioResult> = {
      Safe: {} as ScenarioResult,
      Base: {} as ScenarioResult,
      Aggressive: {} as ScenarioResult,
    };

    (Object.keys(CONVERSION_RATES) as ScenarioKey[]).forEach((scenario) => {
      const conversionRate = CONVERSION_RATES[scenario];
      const clicksPerMonth = values.monthlyAdBudget / selectedCpc;
      const ordersPerMonth = clicksPerMonth * conversionRate;
      const adCostPerSale = values.monthlyAdBudget / Math.max(ordersPerMonth, 1);
      const profitAfterAds = grossProfitPerUnit - adCostPerSale;

      // Cash flow simulation
      let cashBalance = values.totalBudget - values.initialUnits * values.ddpCost;
      let lowestCash = cashBalance;
      for (let month = 0; month < values.monthsNegative; month += 1) {
        const revenuePerMonth = ordersPerMonth * values.targetPrice;
        const costOfGoodsPerMonth = ordersPerMonth * values.ddpCost;
        const amazonFeesPerMonth = ordersPerMonth * amazonFees;
        const monthlyProfit = revenuePerMonth - costOfGoodsPerMonth - amazonFeesPerMonth - values.monthlyAdBudget;
        cashBalance += monthlyProfit;
        lowestCash = Math.min(lowestCash, cashBalance);
      }

      scenarioResults[scenario] = {
        conversionRate,
        clicksPerMonth,
        ordersPerMonth,
        adCostPerSale,
        profitAfterAds,
        staysPositive: lowestCash >= 0,
        lowestCash,
      };
    });

    // Risk verdict logic
    const survivors = (Object.values(scenarioResults) as ScenarioResult[]).filter(
      (scenario) => scenario.staysPositive,
    ).length;

    if (survivors === 3) {
      setVerdict('Financially Feasible – Low/Medium Risk');
      setVerdictTone('green');
    } else if (survivors === 2) {
      setVerdict('Borderline – Medium/High Risk');
      setVerdictTone('amber');
    } else {
      setVerdict('Underfunded – High Risk');
      setVerdictTone('red');
    }

    setResults(scenarioResults);
  };

  const handleChange = (
    key: keyof FormValues,
    value: FormValues[keyof FormValues],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Amazon Launch Viability Checker</p>
            <h1 className="text-2xl font-bold text-slate-900">Plan smarter launches with quick viability math.</h1>
          </div>
          {verdict && <ResultBadge label={verdict} tone={verdictTone} />}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Basics</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Marketplace
                <select
                  className="input"
                  value={values.marketplace}
                  onChange={(e) => handleChange('marketplace', e.target.value as FormValues['marketplace'])}
                >
                  <option>US</option>
                  <option>UK</option>
                  <option>DE</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Category
                <select
                  className="input"
                  value={values.category}
                  onChange={(e) => handleChange('category', e.target.value as FormValues['category'])}
                >
                  <option>Home & Kitchen</option>
                  <option>Beauty</option>
                  <option>Sports</option>
                  <option>Other</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Product economics</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Target sale price ($)
                <input
                  type="number"
                  className="input"
                  value={values.targetPrice}
                  min={0}
                  step={0.01}
                  onChange={(e) => handleChange('targetPrice', sanitizeNumber(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                DDP cost per unit to FBA ($)
                <input
                  type="number"
                  className="input"
                  value={values.ddpCost}
                  min={0}
                  step={0.01}
                  onChange={(e) => handleChange('ddpCost', sanitizeNumber(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Product size class
                <select
                  className="input"
                  value={values.sizeClass}
                  onChange={(e) => handleChange('sizeClass', e.target.value as FormValues['sizeClass'])}
                >
                  <option>Small standard</option>
                  <option>Large standard</option>
                  <option>Oversize</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Budget & inventory</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Total starting budget all-in ($)
                <input
                  type="number"
                  className="input"
                  value={values.totalBudget}
                  min={0}
                  step={100}
                  onChange={(e) => handleChange('totalBudget', sanitizeNumber(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Planned initial inventory units
                <input
                  type="number"
                  className="input"
                  value={values.initialUnits}
                  min={0}
                  step={10}
                  onChange={(e) => handleChange('initialUnits', sanitizeNumber(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Monthly ad budget ($)
                <input
                  type="number"
                  className="input"
                  value={values.monthlyAdBudget}
                  min={0}
                  step={50}
                  onChange={(e) => handleChange('monthlyAdBudget', sanitizeNumber(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Months willing to be negative
                <input
                  type="number"
                  className="input"
                  value={values.monthsNegative}
                  min={1}
                  step={1}
                  onChange={(e) => handleChange('monthsNegative', sanitizeNumber(e.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Competition</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Competition level
                <select
                  className="input"
                  value={values.competition}
                  onChange={(e) => handleChange('competition', e.target.value as FormValues['competition'])}
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <button
            type="button"
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800"
            onClick={handleCalculate}
          >
            Run Launch Check
          </button>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Results</h2>
            {!results && <p className="mt-3 text-sm text-slate-600">Fill the form and run the check to see viability.</p>}
            {results && (
              <div className="space-y-4">
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-600">Risk verdict</p>
                    <ResultBadge label={verdict} tone={verdictTone} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    Based on your inputs and our assumptions, your launch looks {verdict.toLowerCase()} over
                    {` ${values.monthsNegative} `}month{values.monthsNegative > 1 ? 's' : ''}.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Unit economics</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-700">
                    <div>
                      <dt className="text-slate-500">Target price</dt>
                      <dd className="font-semibold">{currency(values.targetPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Amazon fees (est.)</dt>
                      <dd className="font-semibold">{currency(amazonFees)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">DDP cost</dt>
                      <dd className="font-semibold">{currency(values.ddpCost)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Gross profit/unit (before ads)</dt>
                      <dd className="font-semibold">{currency(grossProfitPerUnit)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Scenario outlook</h3>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-slate-700">
                        <tr>
                          <th className="px-3 py-2">Scenario</th>
                          <th className="px-3 py-2">Conv. rate</th>
                          <th className="px-3 py-2">Orders / mo.</th>
                          <th className="px-3 py-2">Ad cost / sale</th>
                          <th className="px-3 py-2">Profit / unit</th>
                          <th className="px-3 py-2">Cash > 0?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(Object.keys(results) as ScenarioKey[]).map((key) => {
                          const scenario = results[key];
                          return (
                            <tr key={key} className="odd:bg-white even:bg-slate-50">
                              <td className="px-3 py-2 font-semibold text-slate-900">{key}</td>
                              <td className="px-3 py-2 text-slate-700">{percent(scenario.conversionRate)}</td>
                              <td className="px-3 py-2 text-slate-700">{scenario.ordersPerMonth.toFixed(1)}</td>
                              <td className="px-3 py-2 text-slate-700">{currency(scenario.adCostPerSale)}</td>
                              <td className={`px-3 py-2 font-medium ${scenario.profitAfterAds >= 0 ? 'text-green-700' : 'text-rose-700'}`}>
                                {currency(scenario.profitAfterAds)}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {scenario.staysPositive ? 'Yes' : 'No'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  This is a simplified simulation based on rough assumptions. It does NOT guarantee any results and is not
                  financial advice. All business decisions and risks remain your own.
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;
