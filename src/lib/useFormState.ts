import { useCallback, useState } from 'react'

/**
 * Estado de formulário com "tem alteração?".
 *
 * A barra de salvar só aparece quando o que está na tela difere do que está
 * gravado: um botão "Salvar" sempre visível não diz se falta salvar algo.
 */
export function useFormState<T>(initial: T) {
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  /** Depois de carregar ou salvar: o que está na tela passa a ser o gravado. */
  const load = useCallback((value: T) => {
    setSaved(value)
    setForm(value)
  }, [])

  const reset = useCallback(() => setForm(saved), [saved])

  return { form, setForm, dirty, load, reset }
}
