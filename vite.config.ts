import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/anwesenheitsapp/',plugins:[react()],css:{postcss:{plugins:[]}}});
