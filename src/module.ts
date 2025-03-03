import { PanelPlugin } from '@grafana/data';
import { SimplePanel } from './components/SimplePanel';

export const plugin = new PanelPlugin(SimplePanel).setPanelOptions((builder) => {
  return builder
    .addTextInput({
      path: 'groqApiKey',
      name: 'groq-API-key',
      description: 'Enter your api key'
    })
    .addTextInput({
      path: 'initalChatMessage',
      name: 'Inital message.',
      description: 'This field should contain the inital Text for the Groq API. At the end of the comand the data will be inserted.',
      defaultValue: ''
    })
    .addTextInput({
      path: 'llmUsed',
      name: 'LLM model name.',
      description: 'Define the LLM model that should be used when making teh API call to GROQ.',
      defaultValue: 'llama-3.3-70b-versatile'
    })
});
