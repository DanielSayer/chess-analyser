import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const vendor = (packages: string) => new RegExp(`[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:${packages})[\\/]`)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks cache across app releases. Review and Play are lazy routes (see App.tsx).
        codeSplitting: {
          groups: [
            { name: 'react', test: vendor('react|react-dom|scheduler') },
            { name: 'heroui', test: vendor('@heroui|@react-aria|@react-stately|@react-types|@internationalized|react-aria|react-aria-components|react-stately|tailwind-variants|tailwind-merge|@swc') },
            { name: 'board', test: vendor('react-chessboard|@dnd-kit') },
          ],
        },
      },
    },
  },
})
