import { useToast } from '../components/Toast';

export function useAchievementToast() {
  const { showToast } = useToast();

  return function showAchievements(achievements: Array<{ name: string; icon: string }>) {
    for (const a of achievements) {
      setTimeout(() => {
        showToast(`${a.icon} Achievement: ${a.name}!`, 4000);
      }, 500);
    }
  };
}
