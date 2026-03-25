import { useState } from 'react';
import { Calculator, TrendingUp, Home, DollarSign, Percent, Info, BarChart3, RefreshCw } from 'lucide-react';

type CalcTab = 'mortgage' | 'commission' | 'transaction' | 'roi' | 'compare';

interface MortgageResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[];
}

export default function FinancialCalculator() {
  const [activeTab, setActiveTab] = useState<CalcTab>('mortgage');

  // Mortgage
  const [propertyPrice, setPropertyPrice] = useState(600000);
  const [downPayment, setDownPayment] = useState(120000);
  const [interestRate, setInterestRate] = useState(7.5);
  const [loanYears, setLoanYears] = useState(25);
  const [mortgageResult, setMortgageResult] = useState<MortgageResult | null>(null);

  // Commission
  const [salePrice, setSalePrice] = useState(500000);
  const [commissionRate, setCommissionRate] = useState(3);
  const [commissionVAT, setCommissionVAT] = useState(true);
  const [commissionSplit, setCommissionSplit] = useState(50);

  // Transaction costs
  const [txPrice, setTxPrice] = useState(500000);
  const [txType, setTxType] = useState<'primary' | 'secondary'>('secondary');
  const [txFinancing, setTxFinancing] = useState<'cash' | 'mortgage'>('mortgage');

  // ROI
  const [roiPurchase, setRoiPurchase] = useState(400000);
  const [roiRenovation, setRoiRenovation] = useState(50000);
  const [roiMonthlyRent, setRoiMonthlyRent] = useState(2500);
  const [roiManagement, setRoiManagement] = useState(8);
  const [roiOccupancy, setRoiOccupancy] = useState(95);

  // Compare
  const [compareProps, setCompareProps] = useState([
    { name: 'Mieszkanie A', price: 550000, area: 65, rooms: 3, floor: 4, year: 2020, parking: true, balcony: true },
    { name: 'Mieszkanie B', price: 480000, area: 58, rooms: 3, floor: 2, year: 2010, parking: false, balcony: true },
    { name: 'Mieszkanie C', price: 620000, area: 72, rooms: 4, floor: 7, year: 2023, parking: true, balcony: true },
  ]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(v);
  const formatPct = (v: number) => `${v.toFixed(2)}%`;

  const calculateMortgage = () => {
    const principal = propertyPrice - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const months = loanYears * 12;
    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    let balance = principal;
    const schedule: MortgageResult['schedule'] = [];
    for (let i = 1; i <= Math.min(months, 24); i++) {
      const interest = balance * monthlyRate;
      const princ = payment - interest;
      balance -= princ;
      schedule.push({ month: i, payment, principal: princ, interest, balance: Math.max(0, balance) });
    }
    setMortgageResult({
      monthlyPayment: payment,
      totalPayment: payment * months,
      totalInterest: payment * months - principal,
      schedule,
    });
  };

  const commissionGross = salePrice * commissionRate / 100;
  const commissionNet = commissionVAT ? commissionGross / 1.23 : commissionGross;
  const commissionVatAmount = commissionVAT ? commissionGross - commissionNet : 0;
  const commissionAgent = commissionGross * commissionSplit / 100;
  const commissionAgency = commissionGross * (1 - commissionSplit / 100);

  const calcTransactionCosts = () => {
    const pcc = txType === 'secondary' ? txPrice * 0.02 : 0;
    const notary = Math.min(txPrice * 0.005 + 246, 10000);
    const bankFees = txFinancing === 'mortgage' ? txPrice * 0.015 : 0;
    const insurance = txFinancing === 'mortgage' ? txPrice * 0.001 * 12 : 0;
    return { pcc, notary, bankFees, insurance, total: pcc + notary + bankFees + insurance };
  };
  const txCosts = calcTransactionCosts();

  const roiTotalInvestment = roiPurchase + roiRenovation + txCosts.total;
  const roiAnnualRent = roiMonthlyRent * 12 * (roiOccupancy / 100);
  const roiManagementCost = roiAnnualRent * (roiManagement / 100);
  const roiNetIncome = roiAnnualRent - roiManagementCost;
  const roiGrossYield = (roiAnnualRent / roiTotalInvestment) * 100;
  const roiNetYield = (roiNetIncome / roiTotalInvestment) * 100;
  const roiPayback = roiTotalInvestment / roiNetIncome;

  const TABS = [
    { id: 'mortgage', label: 'Kredyt hipoteczny', icon: Home },
    { id: 'commission', label: 'Prowizja', icon: Percent },
    { id: 'transaction', label: 'Koszty transakcji', icon: DollarSign },
    { id: 'roi', label: 'ROI Inwestycji', icon: TrendingUp },
    { id: 'compare', label: 'Porównaj oferty', icon: BarChart3 },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Calculator className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          Kalkulator Finansowy
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Narzędzia finansowe dla agenta i klienta</p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as CalcTab)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* MORTGAGE */}
      {activeTab === 'mortgage' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Parametry kredytu</h2>

            {[
              { label: 'Cena nieruchomości', value: propertyPrice, setter: setPropertyPrice, min: 100000, max: 5000000, step: 10000 },
              { label: 'Wkład własny', value: downPayment, setter: setDownPayment, min: 0, max: propertyPrice, step: 5000 },
            ].map(({ label, value, setter, min, max, step }) => (
              <div key={label}>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(value)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={value} onChange={e => setter(Number(e.target.value))}
                  title={label}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{formatCurrency(min)}</span><span>{formatCurrency(max)}</span>
                </div>
              </div>
            ))}

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Kwota kredytu:</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">{formatCurrency(propertyPrice - downPayment)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600 dark:text-gray-400">LTV:</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">{((propertyPrice - downPayment) / propertyPrice * 100).toFixed(1)}%</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Oprocentowanie roczne</label>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{interestRate}%</span>
              </div>
              <input type="range" min={1} max={15} step={0.1} value={interestRate} onChange={e => setInterestRate(Number(e.target.value))}
                title="Oprocentowanie roczne"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Okres kredytowania</label>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{loanYears} lat</span>
              </div>
              <input type="range" min={5} max={35} step={1} value={loanYears} onChange={e => setLoanYears(Number(e.target.value))}
                title="Okres kredytowania"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
            </div>

            <button onClick={calculateMortgage}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" />
              Oblicz ratę kredytu
            </button>
          </div>

          <div className="space-y-4">
            {mortgageResult ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Miesięczna rata', value: formatCurrency(mortgageResult.monthlyPayment), color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
                    { label: 'Łączna spłata', value: formatCurrency(mortgageResult.totalPayment), color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' },
                    { label: 'Koszt odsetek', value: formatCurrency(mortgageResult.totalInterest), color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' },
                  ].map(item => (
                    <div key={item.label} className={`${item.color} rounded-xl p-3 text-center`}>
                      <p className="text-2xl font-bold">{item.value}</p>
                      <p className="text-xs mt-1 opacity-75">{item.label}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Harmonogram spłat (pierwsze 24 miesiące)</h3>
                  <div className="overflow-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="py-1.5 text-left text-gray-500 dark:text-gray-400">Miesiąc</th>
                          <th className="py-1.5 text-right text-gray-500 dark:text-gray-400">Rata</th>
                          <th className="py-1.5 text-right text-gray-500 dark:text-gray-400">Kapital</th>
                          <th className="py-1.5 text-right text-gray-500 dark:text-gray-400">Odsetki</th>
                          <th className="py-1.5 text-right text-gray-500 dark:text-gray-400">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mortgageResult.schedule.map(row => (
                          <tr key={row.month} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="py-1.5 text-gray-700 dark:text-gray-300">{row.month}</td>
                            <td className="py-1.5 text-right font-medium text-gray-900 dark:text-white">{formatCurrency(row.payment)}</td>
                            <td className="py-1.5 text-right text-green-600 dark:text-green-400">{formatCurrency(row.principal)}</td>
                            <td className="py-1.5 text-right text-red-500 dark:text-red-400">{formatCurrency(row.interest)}</td>
                            <td className="py-1.5 text-right text-blue-600 dark:text-blue-400">{formatCurrency(row.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center">
                <Calculator className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Ustaw parametry i kliknij „Oblicz ratę kredytu"</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMMISSION */}
      {activeTab === 'commission' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kalkulator prowizji</h2>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cena sprzedaży</label>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(salePrice)}</span>
              </div>
              <input type="range" min={100000} max={5000000} step={10000} value={salePrice} onChange={e => setSalePrice(Number(e.target.value))}
                title="Cena sprzedaży"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Stawka prowizji</label>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{commissionRate}%</span>
              </div>
              <input type="range" min={0.5} max={6} step={0.1} value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))}
                title="Stawka prowizji"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500" />
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Podział: Agent / Agencja</label>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{commissionSplit}% / {100 - commissionSplit}%</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={commissionSplit} onChange={e => setCommissionSplit(Number(e.target.value))}
                title="Podział: Agent / Agencja"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={commissionVAT} onChange={e => setCommissionVAT(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Uwzględnij VAT (23%)</span>
            </label>
          </div>

          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800 p-6">
              <h3 className="text-lg font-bold text-green-800 dark:text-green-300 mb-4">Wyniki prowizji</h3>
              <div className="space-y-3">
                {[
                  { label: 'Prowizja brutto', value: formatCurrency(commissionGross), big: true },
                  { label: 'Prowizja netto', value: formatCurrency(commissionNet) },
                  { label: 'VAT (23%)', value: formatCurrency(commissionVatAmount) },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center py-2 border-b border-green-200 dark:border-green-800 last:border-0">
                    <span className="text-sm text-green-700 dark:text-green-400">{item.label}</span>
                    <span className={`${item.big ? 'text-2xl' : 'text-lg'} font-bold text-green-800 dark:text-green-300`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Zarobi agent ({commissionSplit}%)</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(commissionAgent)}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">Zarobi agencja ({100 - commissionSplit}%)</p>
                <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(commissionAgency)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION COSTS */}
      {activeTab === 'transaction' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Koszty transakcji</h2>

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cena nieruchomości</label>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(txPrice)}</span>
              </div>
              <input type="range" min={100000} max={5000000} step={10000} value={txPrice} onChange={e => setTxPrice(Number(e.target.value))}
                title="Cena nieruchomości"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Rynek</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'primary', label: 'Pierwotny' }, { id: 'secondary', label: 'Wtórny' }].map(opt => (
                  <button key={opt.id} onClick={() => setTxType(opt.id as 'primary' | 'secondary')}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${txType === opt.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Finansowanie</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'cash', label: 'Gotówka' }, { id: 'mortgage', label: 'Kredyt' }].map(opt => (
                  <button key={opt.id} onClick={() => setTxFinancing(opt.id as 'cash' | 'mortgage')}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${txFinancing === opt.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Zestawienie kosztów</h3>
            <div className="space-y-3">
              {[
                { label: 'PCC 2% (rynek wtórny)', value: txCosts.pcc, show: txType === 'secondary' },
                { label: 'Koszty notarialne (szac.)', value: txCosts.notary, show: true },
                { label: 'Opłaty bankowe (1.5%)', value: txCosts.bankFees, show: txFinancing === 'mortgage' },
                { label: 'Ubezpieczenie kredytu (12 mies.)', value: txCosts.insurance, show: txFinancing === 'mortgage' },
              ].filter(i => i.show).map(item => (
                <div key={item.label} className="flex justify-between items-center py-2.5 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(item.value)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 mt-2">
                <span className="text-sm font-bold text-red-700 dark:text-red-400">Łączne koszty dodatkowe</span>
                <span className="text-xl font-bold text-red-700 dark:text-red-400">{formatCurrency(txCosts.total)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3">
                <span className="text-sm font-bold text-blue-700 dark:text-blue-400">Całkowity koszt zakupu</span>
                <span className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(txPrice + txCosts.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROI */}
      {activeTab === 'roi' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kalkulator ROI najmu</h2>
            {[
              { label: 'Cena zakupu', value: roiPurchase, setter: setRoiPurchase, min: 100000, max: 3000000, step: 10000 },
              { label: 'Koszty remontu', value: roiRenovation, setter: setRoiRenovation, min: 0, max: 500000, step: 5000 },
            ].map(({ label, value, setter, min, max, step }) => (
              <div key={label}>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(value)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={value} onChange={e => setter(Number(e.target.value))}
                  title={label}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
              </div>
            ))}

            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Miesięczny czynsz</label>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{formatCurrency(roiMonthlyRent)}</span>
              </div>
              <input type="range" min={500} max={15000} step={100} value={roiMonthlyRent} onChange={e => setRoiMonthlyRent(Number(e.target.value))}
                title="Miesięczny czynsz"
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Obłożenie</label>
                  <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{roiOccupancy}%</span>
                </div>
                <input type="range" min={50} max={100} step={1} value={roiOccupancy} onChange={e => setRoiOccupancy(Number(e.target.value))}
                  title="Obłożenie"
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Zarządzanie</label>
                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{roiManagement}%</span>
                </div>
                <input type="range" min={0} max={20} step={1} value={roiManagement} onChange={e => setRoiManagement(Number(e.target.value))}
                  title="Zarządzanie"
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Stopa zwrotu brutto', value: formatPct(roiGrossYield), sub: 'rocznie', color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' },
                { label: 'Stopa zwrotu netto', value: formatPct(roiNetYield), sub: 'po kosztach', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
                { label: 'Dochód netto rocznie', value: formatCurrency(roiNetIncome), sub: 'po kosztach', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' },
                { label: 'Zwrot inwestycji', value: `${roiPayback.toFixed(1)} lat`, sub: 'czas zwrotu', color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' },
              ].map(item => (
                <div key={item.label} className={`${item.color} rounded-xl p-4 text-center`}>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-sm font-medium mt-1">{item.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Szczegółowe zestawienie</h3>
              <div className="space-y-2">
                {[
                  { label: 'Całkowita inwestycja', value: formatCurrency(roiTotalInvestment) },
                  { label: 'Roczny czynsz brutto', value: formatCurrency(roiAnnualRent) },
                  { label: 'Koszty zarządzania', value: `- ${formatCurrency(roiManagementCost)}` },
                  { label: 'Roczny dochód netto', value: formatCurrency(roiNetIncome), bold: true },
                ].map(item => (
                  <div key={item.label} className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                    <span className={`${item.bold ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPARE */}
      {activeTab === 'compare' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Porównywarka ofert</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Zestawienie do 3 nieruchomości</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600 dark:text-gray-400 w-40">Parametr</th>
                  {compareProps.map((prop, i) => (
                    <th key={i} className="px-4 py-3 text-center">
                      <input value={prop.name} onChange={e => setCompareProps(prev => prev.map((p, pi) => pi === i ? { ...p, name: e.target.value } : p))}
                        title="Nazwa nieruchomości"
                        className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-600 text-center w-full focus:outline-none focus:border-blue-500" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[
                  { label: 'Cena', key: 'price', format: (v: number) => formatCurrency(v), type: 'range', min: 200000, max: 2000000, step: 10000 },
                  { label: 'Pow. (m²)', key: 'area', format: (v: number) => `${v} m²`, type: 'range', min: 20, max: 200, step: 1 },
                  { label: 'Cena/m²', key: null, format: (_: number, prop: typeof compareProps[0]) => formatCurrency(prop.price / prop.area), type: 'computed' },
                  { label: 'Pokoje', key: 'rooms', format: (v: number) => `${v} pok.`, type: 'range', min: 1, max: 6, step: 1 },
                  { label: 'Piętro', key: 'floor', format: (v: number) => v === 0 ? 'Parter' : `${v} p.`, type: 'range', min: 0, max: 20, step: 1 },
                  { label: 'Rok budowy', key: 'year', format: (v: number) => v.toString(), type: 'range', min: 1960, max: 2025, step: 1 },
                ].map(row => (
                  <tr key={row.label} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</td>
                    {compareProps.map((prop, i) => {
                      const key = row.key as keyof typeof prop | null;
                      const val = key ? (prop[key] as number) : 0;
                      const allVals = key ? compareProps.map(p => p[key] as number) : [];
                      const isMin = row.key && val === Math.min(...allVals);
                      const isMax = row.key && val === Math.max(...allVals);
                      return (
                        <td key={i} className="px-4 py-3 text-center">
                          {row.type === 'computed' ? (
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {row.format(0, prop)}
                            </span>
                          ) : (
                            <div>
                              <span className={`text-sm font-semibold block mb-1 ${isMax ? 'text-green-600 dark:text-green-400' : isMin ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                {row.format(val, prop)}
                              </span>
                              <input type="range" min={row.type === 'range' ? row.min : 0} max={row.type === 'range' ? row.max : 0} step={row.type === 'range' ? row.step : 1} value={val}
                                onChange={e => setCompareProps(prev => prev.map((p, pi) => pi === i ? { ...p, [row.key!]: Number(e.target.value) } : p))}
                                title={row.label}
                                className="w-24 h-1 accent-blue-600" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {[
                  { label: 'Parking', key: 'parking' },
                  { label: 'Balkon', key: 'balcony' },
                ].map(row => (
                  <tr key={row.label} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</td>
                    {compareProps.map((prop, i) => (
                      <td key={i} className="px-4 py-3 text-center">
                        <button onClick={() => setCompareProps(prev => prev.map((p, pi) => pi === i ? { ...p, [row.key]: !(p[row.key as keyof typeof p] as boolean) } : p))}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${(prop[row.key as keyof typeof prop] as boolean) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {(prop[row.key as keyof typeof prop] as boolean) ? '✓ Tak' : '✗ Nie'}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
