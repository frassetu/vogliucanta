'use client'

interface Props {
  onLogin: () => void
  onLater: () => void
}

// Petit message qui apparaît une seule fois, quand un visiteur sans compte
// ajoute son premier favori.
export default function LoginHint({ onLogin, onLater }: Props) {
  return (
    <div className="fixed left-4 right-4 bottom-24 z-[70] max-w-lg mx-auto p-4 rounded-2xl bg-surface border border-border shadow-lg">
      <p className="text-text text-sm leading-relaxed">
        Cunnettitivi per ritruvà i voscii favuriti nantu à tutti i voscii apparechji.
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onLogin}
          className="flex-1 py-2.5 rounded-xl accent-gradient text-white font-display font-semibold text-sm"
        >
          Cunnettà si
        </button>
        <button
          onClick={onLater}
          className="flex-1 py-2.5 rounded-xl bg-card border border-border text-text-muted text-sm font-medium"
        >
          Più tardi
        </button>
      </div>
    </div>
  )
}
