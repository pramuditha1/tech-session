/**
 * In-memory todo store and tool definitions for the Agent service.
 * Tools: add_todo, list_todos (OpenAI function-calling schema + execution).
 */

const todos = [];
let nextId = 1;

// /** Chat Completions API format (legacy). */
// export const toolDefinitions = [
//   {
//     type: "function",
//     function: {
//       name: "add_todo",
//       description: "Add a new todo item to the list",
//       parameters: {
//         type: "object",
//         properties: {
//           title: { type: "string", description: "The title of the todo" },
//         },
//         required: ["title"],
//       },
//     },
//   },
//   {
//     type: "function",
//     function: {
//       name: "list_todos",
//       description: "List all current todo items",
//       parameters: { type: "object", properties: {} },
//     },
//   },
// ];

/** Responses API format (v1/responses, gpt-5-nano etc.). */
export const responsesApiTools = [
  {
    type: "function",
    name: "add_todo",
    description: "Add a new todo item to the list",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The title of the todo" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "list_todos",
    description: "List all current todo items",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
];

/**
 * Execute a tool by name with the given arguments.
 * @returns {Promise<string>} JSON string result for the LLM.
 */
export function executeTool(name, args) {
  switch (name) {
    case "add_todo": {
      const title = args?.title ?? "";
      const id = String(nextId++);
      todos.push({ id, title, completed: false });
      return JSON.stringify({ ok: true, id, title, message: `Added todo: ${title}` });
    }
    case "list_todos": {
      return JSON.stringify({
        todos: todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed })),
      });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
