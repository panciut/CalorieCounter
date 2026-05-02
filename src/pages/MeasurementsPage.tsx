import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { today, fmtDate, formatShortDate, toLocalISO, MS_PER_DAY } from '../lib/dateUtil';
import LineChartCard from '../components/LineChartCard';
import RangePicker from '../components/ui/RangePicker';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import type { Measurement } from '../types';

type MeasurementField = 'waist' | 'chest' | 'arms' | 'thighs' | 'hips' | 'neck';
type Range = 30 | 90 | 180 | 365 | 'all';

const FIELDS: MeasurementField[] = ['waist', 'chest', 'arms', 'thighs', 'hips', 'neck'];
const RANGES: Range[] = [30, 90, 180, 365, 'all'];

export default function MeasurementsPage() {
  const { t } = useT();
  const { showToast } = useToast();

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [date, setDate] = useState(today());
  const [range, setRange] = useState<Range>(180);
  const [form, setForm] = useState<Record<MeasurementField, string>>({
    waist: '', chest: '', arms: '', thighs: '', hips: '', neck: '',
  });

  const load = async () => {
    const data = await api.measurements.getAll();
    setMeasurements(data);
  };

  useEffect(() => { load(); }, []);

  const parseField = (val: string): number | null =>
    val.trim() === '' ? null : Number(val);

  const handleAdd = async () => {
    await api.measurements.add({
      date,
      waist: parseField(form.waist),
      chest: parseField(form.chest),
      arms: parseField(form.arms),
      thighs: parseField(form.thighs),
      hips: parseField(form.hips),
      neck: parseField(form.neck),
    });
    setForm({ waist: '', chest: '', arms: '', thighs: '', hips: '', neck: '' });
    setDate(today());
    await load();
    showToast(t('common.saved'));
  };

  const handleDelete = async (id: number) => {
    await api.measurements.delete(id);
    await load();
  };

  const cutoff = range === 'all'
    ? '0000-00-00'
    : toLocalISO(new Date(Date.now() - range * MS_PER_DAY));

  const getChartData = (field: MeasurementField) =>
    measurements
      .filter(m => m[field] !== null && m.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(m => ({ label: formatShortDate(m.date), date: m.date, value: m[field] as number }));

  const sortedMeasurements = [...measurements].sort((a, b) => b.date.localeCompare(a.date));

  const numCls = "w-full bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder:text-text-sec focus:outline-none focus:border-accent text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t('eyebrow.measurements')} title={t('page.measurements')} />

      {/* Add form */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-base font-semibold text-text mb-3">{t('meas.addTitle')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-text-sec mb-1">{t('weight.dateCol')}</label>
            <input
              type="date"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent text-sm"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          {FIELDS.map(field => (
            <div key={field}>
              <label className="block text-xs text-text-sec mb-1">{t(`meas.${field}`)}</label>
              <input
                type="text" inputMode="decimal"
                className={numCls}
                placeholder="—"
                value={form[field]}
                onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button
          className="bg-accent text-white font-medium px-5 py-2 rounded-lg hover:opacity-90 transition-opacity text-sm cursor-pointer"
          onClick={handleAdd}
        >
          {t('common.add')}
        </button>
      </div>

      {/* Charts */}
      {measurements.length > 0 && (
        <>
          <div className="flex items-center justify-end mb-3">
            <RangePicker<Range>
              value={range}
              options={RANGES}
              onChange={setRange}
              formatLabel={r => r === 'all' ? (t('meas.rangeAll') ?? 'All') : `${r}d`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELDS.map(field => {
              const data = getChartData(field);
              if (data.length === 0) return null;
              const first = data[0].value;
              const last = data[data.length - 1].value;
              const delta = +(last - first).toFixed(1);
              const deltaSign = delta > 0 ? '+' : '';
              const deltaCls =
                data.length < 2 ? 'text-text-sec' :
                delta === 0 ? 'text-text-sec' :
                // For body measurements smaller is generally desirable for waist/hips, larger for arms/chest/thighs/neck
                ((field === 'waist' || field === 'hips') ? (delta < 0 ? 'text-green' : 'text-accent') : (delta > 0 ? 'text-green' : 'text-accent'));
              return (
                <div key={field} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t(`meas.${field}`)}</h3>
                    <div className="flex items-baseline gap-2 text-xs tabular-nums">
                      <span className="text-text font-medium">{last} cm</span>
                      {data.length >= 2 && (
                        <span className={deltaCls}>{deltaSign}{delta} cm</span>
                      )}
                    </div>
                  </div>
                  <LineChartCard data={data} unit=" cm" height={160} showTrend={data.length >= 3} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Table */}
      {sortedMeasurements.length === 0 ? (
        <EmptyState message={t('meas.noEntries')} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-text-sec text-xs font-medium uppercase tracking-wider px-4 py-3">{t('weight.dateCol')}</th>
                {FIELDS.map(field => (
                  <th key={field} className="text-left text-text-sec text-xs font-medium uppercase tracking-wider px-4 py-3">
                    {t(`meas.${field}`)}
                  </th>
                ))}
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {sortedMeasurements.map((m) => (
                <tr key={m.id} className="border-t border-border/50 hover:bg-bg/30 transition-colors">
                  <td className="px-4 py-3 text-text whitespace-nowrap">{fmtDate(m.date)}</td>
                  {FIELDS.map(field => (
                    <td key={field} className="px-4 py-3 text-text tabular-nums">
                      {m[field] !== null ? m[field] : <span className="text-text-sec">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      className="text-text-sec hover:text-red transition-colors cursor-pointer px-1"
                      onClick={() => handleDelete(m.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
