import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { createNutrition, deleteNutrition, getNutrition, updateNutrition } from '../services/api';

const emptyForm = {
  mealType: 'Breakfast',
  foodName: '',
  quantity: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  intakeDate: new Date().toISOString().slice(0, 16),
};

const isToday = (value) => new Date(value).toDateString() === new Date().toDateString();

export default function NutritionPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadItems() {
    try {
      const response = await getNutrition();
      setItems(response.data.items);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load meals.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await getNutrition();
        if (active) {
          setItems(response.data.items);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Unable to load meals.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const handleChange = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  const todayItems = useMemo(() => items.filter((item) => isToday(item.intakeDate)), [items]);
  const totals = todayItems.reduce((sum, item) => ({
    calories: sum.calories + Number(item.calories || 0),
    protein: sum.protein + Number(item.protein || 0),
    carbs: sum.carbs + Number(item.carbs || 0),
    fat: sum.fat + Number(item.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const submitMeal = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      calories: Number(form.calories || 0),
      protein: Number(form.protein || 0),
      carbs: Number(form.carbs || 0),
      fat: Number(form.fat || 0),
      intakeDate: new Date(form.intakeDate).toISOString(),
    };
    try {
      if (editingId) {
        await updateNutrition(editingId, payload);
        setNotice('Meal updated.');
      } else {
        await createNutrition(payload);
        setNotice('Meal saved.');
      }
      setForm({ ...emptyForm, intakeDate: new Date().toISOString().slice(0, 16) });
      setEditingId(null);
      await loadItems();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save this meal.');
    } finally {
      setSaving(false);
    }
  };

  const editMeal = (item) => {
    setEditingId(item._id);
    setForm({
      mealType: item.mealType,
      foodName: item.foodName,
      quantity: item.quantity || '',
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      intakeDate: new Date(item.intakeDate).toISOString().slice(0, 16),
    });
  };

  const removeMeal = async (id) => {
    if (!window.confirm('Delete this meal record?')) return;
    try {
      await deleteNutrition(id);
      setNotice('Meal deleted.');
      await loadItems();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete this meal.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-lime-300">Fuel</div>
        <h1 className="mt-2 text-3xl font-bold text-white">Nutrition tracking</h1>
      </div>
      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-sm text-lime-200">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <form onSubmit={submitMeal} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold text-white">{editingId ? 'Edit meal' : 'Log meal'}</h2>
          <label className="block text-sm text-slate-300">Meal type<select name="mealType" value={form.mealType} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">{['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map((meal) => <option key={meal} value={meal}>{meal}</option>)}</select></label>
          <label className="block text-sm text-slate-300">Food name<input name="foodName" required maxLength={100} value={form.foodName} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="block text-sm text-slate-300">Quantity<input name="quantity" maxLength={50} value={form.quantity} onChange={handleChange} placeholder="e.g. 1 bowl" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <label className="block text-sm text-slate-300">Date and time<input type="datetime-local" required name="intakeDate" value={form.intakeDate} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['calories', 'Calories (kcal)'],
              ['protein', 'Protein (g)'],
              ['carbs', 'Carbohydrates (g)'],
              ['fat', 'Fat (g)'],
            ].map(([name, label]) => (
              <label key={name} className="text-sm text-slate-300">{label}<input type="number" min="0" step="0.1" name={name} value={form[name]} onChange={handleChange} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            ))}
          </div>
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-lime-500 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Update meal' : 'Save meal'}</button>
        </form>

        <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Today’s nutrition</h2>
            <span className="rounded-full bg-lime-500/10 px-2 py-1 text-xs font-medium text-lime-200">From logged meals</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(totals).map(([label, amount]) => (
              <div key={label} className="rounded-2xl bg-slate-800/70 p-4">
                <div className="text-sm capitalize text-slate-400">{label}</div>
                <div className="mt-2 text-2xl font-bold text-white">{Math.round(amount * 10) / 10}{label === 'calories' ? ' kcal' : ' g'}</div>
              </div>
            ))}
          </div>
          <h3 className="pt-2 font-semibold text-white">Meal history</h3>
          {loading ? <p className="text-sm text-slate-400">Loading meals…</p> : items.length ? (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={item._id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800/70 p-3">
                  <div>
                    <div className="font-medium text-white">{item.foodName}</div>
                    <div className="text-sm text-slate-400">{item.mealType} · {item.quantity} · {new Date(item.intakeDate).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <span>{item.calories} kcal · {item.protein}p / {item.carbs}c / {item.fat}f</span>
                    <button type="button" onClick={() => editMeal(item)} aria-label={`Edit ${item.foodName}`} className="rounded-lg p-2 hover:bg-slate-700"><Pencil size={15} /></button>
                    <button type="button" onClick={() => removeMeal(item._id)} aria-label={`Delete ${item.foodName}`} className="rounded-lg p-2 text-rose-300 hover:bg-slate-700"><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No meals recorded yet. Nutrition data is informational, not medical advice.</p>}
        </div>
      </div>
    </div>
  );
}
