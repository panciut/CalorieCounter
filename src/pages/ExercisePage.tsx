import { useState } from 'react';
import ExerciseLog from '../components/ExerciseLog';
import ExerciseLibrary from '../components/ExerciseLibrary';
import ExerciseEquipment from '../components/ExerciseEquipment';
import WorkoutPlans from '../components/WorkoutPlans';
import ExerciseWeekView from '../components/ExerciseWeekView';
import { useT } from '../i18n/useT';
import Tabs from '../components/ui/Tabs';
import PageHeader from '../components/ui/PageHeader';

type ExerciseTab = 'log' | 'library' | 'plans' | 'week' | 'equipment';

export default function ExercisePage() {
  const { t } = useT();
  const [tab, setTab] = useState<ExerciseTab>('log');

  const tabItems = [
    { id: 'log'       as const, label: t('exercise.tabLog') },
    { id: 'library'   as const, label: t('exercise.tabLibrary') },
    { id: 'plans'     as const, label: t('exercise.tabPlans') },
    { id: 'week'      as const, label: t('exercise.tabWeek') },
    { id: 'equipment' as const, label: t('exercise.tabEquipment') },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-0 h-full min-h-0">
      <PageHeader eyebrow={t('eyebrow.exercise')} title={t('page.exercise')} className="mb-4" />

      <Tabs<ExerciseTab>
        items={tabItems}
        active={tab}
        onChange={setTab}
        scrollable
        className="mb-6"
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'log'       && <ExerciseLog />}
        {tab === 'library'   && <ExerciseLibrary />}
        {tab === 'plans'     && <WorkoutPlans />}
        {tab === 'week'      && <ExerciseWeekView />}
        {tab === 'equipment' && <ExerciseEquipment />}
      </div>
    </div>
  );
}
