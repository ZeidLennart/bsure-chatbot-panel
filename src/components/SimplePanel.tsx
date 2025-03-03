import React, { useState } from 'react';
import { getBackendSrv, getDataSourceSrv } from '@grafana/runtime';
import { PanelProps } from '@grafana/data';
import { Observable } from "rxjs";

interface Props extends PanelProps {}

interface Target {
  datasource?: string;
  rawSql?: string;
  refId?: string;
  format?: string;
  title?: string;
  description?: string;
}

interface Panel {
  targets?: Target[];
  title?: string;
  description?: string;
}

interface Message {
  content: string;
  role: string;
}

function convertGrafanaDataToJson(data: string | any[]) {
  if (!data || !Array.isArray(data) || data.length === 0) {
      console.error("Invalid data format");
      return [];
  }

  const fields = data[0]?.fields; // Extract fields from first frame
  if (!fields || !Array.isArray(fields)) {
      console.error("No fields found in data");
      return [];
  }

  const rowCount = fields[0]?.values?.length || 0; // Number of rows

  const result = [];

  for (let i = 0; i < rowCount; i++) {
      const row: { [key: string]: any } = {};
      fields.forEach(field => {
          row[field.name] = field.values[i]; // Map field name to corresponding value
      });
      result.push(row);
  }

  return result;
}

function convertDashboardData(panels: Panel[] | string): Target[] {
  const response: Target[] = [];

  // Ensure we are dealing with an array of panels
  if (typeof panels === "string") {
    try {
      panels = JSON.parse(panels) as Panel[];
    } catch (error) {
      console.error("Invalid JSON string:", error);
      return [];
    }
  }

  if (!Array.isArray(panels)) {
    console.error("Panels must be an array");
    return [];
  }

  for (const panel of panels) {
    if (!panel.targets || !Array.isArray(panel.targets)) {continue};

    for (const target of panel.targets) {
      response.push({
        datasource: target.datasource ?? "Unknown",
        rawSql: target.rawSql ?? "",
        refId: target.refId ?? "",
        format: target.format ?? "",
        title: panel.title ?? "",  
        description: panel.description ?? ""  
      });
    }
  }

  return response;
}



export const SimplePanel: React.FC<Props> = ({ data, options }) => {
  const [inputValue, setInputValue] = useState(""); 
  const [chat, setChat] = useState<Message[]>([])

  const fetchGroqData = async (messages: Message[]) => {
    const apiKey = options.groqApiKey; 

  
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: options.llmUsed,
            messages: messages
        })
    });

    const data_response = await response.json();
    const messageResponse = data_response.choices[0].message
    setChat(value => {
        const newValue = [...value];
        newValue.push(messageResponse);
        return newValue;
    });    
  };

  async function fetchDashboard(): Promise<Target[]> {
    try {
      // First, fetch the list of dashboard metadata
      const dashboardUID = data.request?.dashboardUID;
      if (!dashboardUID) {
        console.log("Dashboard UID not found");
        return [];
      }
  
      // ✅ Await full dashboard JSON by UID
      const dashboardData = await getBackendSrv().get(`/api/dashboards/uid/${dashboardUID}`);
      const convertedData = convertDashboardData(dashboardData.dashboard.panels);
  
      //console.log("Dashboard Data Loaded:", convertedData);
      return convertedData; // ✅ Ensures data is available when awaited
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      return [];
    }
  }  

  // ✅ Queries the datasource and subscribes to the Observable
  async function queryDataSource(target: Target,) {
    try {
      if (!target.datasource) {
        console.error("Datasource is missing in target:", target);
        return;
      }

      const datasource = await getDataSourceSrv().get(target.datasource);

      // Query configuration
      // @ts-ignore
      const response$: Observable<any> = await datasource.query({
        targets: [
          {
            refId: target.refId ?? "A",
            // @ts-ignore
            rawSql: target.rawSql ?? "",
            format: target.format ?? "table",
          },
        ],
        range: {
          // @ts-ignore
          from: new Date(Date.now() - 3600 * 1000), // Last hour
          // @ts-ignore
          to: new Date(),
        },
        intervalMs: 60000,
        maxDataPoints: 500,
        scopedVars: {},
        timezone: "browser",
      });

      return new Promise((resolve, reject) => {
        response$.subscribe({
          next: (response) => {
            const result = convertGrafanaDataToJson(response.data);
            resolve(result);
          },
          error: (err) => {
            console.error("Query failed:", err);
            reject(err);
          },
        });
      });
    } catch (error) {
      console.error("Error fetching datasource or querying data:", error);
      return null;
    }
  }

    async function submitQuestion() {
      const dashboardData = await fetchDashboard();
      if (!dashboardData){return};

      if(chat.length === 0){

        const newPanelData = await Promise.all(
          dashboardData
              .filter((target) => target.rawSql) // Ensure valid SQL queries
              .map(async (target) => {
                  const result = await queryDataSource(target);
                  return {
                      title: target.title,
                      description: target.description,
                      result
                  };
              })
        );
              
        const initialMessages: Message[] = [
            {
                role: "system",
                content: `${options.initalChatMessage} This is the data on the dashboard: ${JSON.stringify(newPanelData, null, 2)}.`
            },
            {
                role: "user",
                content: inputValue
            }
        ];
        setChat(initialMessages);
        fetchGroqData(initialMessages);
      }else{
        const furtherMessages: Message[] = [
          ...chat,
          {
            role: "user",
            content: inputValue
          }
        ];
        setChat(furtherMessages);
        fetchGroqData(furtherMessages)
      }

      setInputValue(''); // Reset the input field
    }

  // Get the correct data source dynamically
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', borderRadius: '5px' }}>
        {chat.slice(1).map((msg, index) => (
          <div key={index} style={{ marginBottom: '5px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
            <span style={{ background: msg.role === 'user' ? '#007bff' : '#ccc', color: msg.role === 'user' ? 'white' : 'black', padding: '5px 10px', borderRadius: '10px', display: 'inline-block' }}>
              {msg.content}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', padding: '10px', borderTop: '1px solid black' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          style={{ flex: 1, padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
        <button onClick={submitQuestion} style={{ marginLeft: '10px', padding: '8px 15px', borderRadius: '5px', background: '#007bff', color: 'white', border: 'none' }}>
          Send
        </button>
      </div>
    </div>
  );
  
};
