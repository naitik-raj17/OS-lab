#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_PROCESSES 100

typedef struct {
  char pid[8];
  int arrival;
  int burst;
} Process;

typedef struct {
  char pid[8];
  int start;
  int end;
} TimelineSlot;

typedef struct {
  char pid[8];
  int arrival;
  int burst;
  int start;
  int completion;
  int waiting;
  int turnaround;
} Result;

static int compareArrival(const void *a, const void *b) {
  const Process *p1 = (const Process *)a;
  const Process *p2 = (const Process *)b;
  if (p1->arrival != p2->arrival) {
    return p1->arrival - p2->arrival;
  }
  return strcmp(p1->pid, p2->pid);
}

int main(void) {
  Process processes[MAX_PROCESSES];
  Result results[MAX_PROCESSES];
  TimelineSlot timeline[MAX_PROCESSES * 2];
  int n = 0;
  
  // Read JSON from stdin (read entire input)
  char input[8192] = {0};
  size_t inputLen = 0;
  char buffer[1024];
  while (fgets(buffer, sizeof(buffer), stdin) != NULL) {
    size_t len = strlen(buffer);
    if (inputLen + len >= sizeof(input) - 1) break;
    strcat(input + inputLen, buffer);
    inputLen += len;
  }
  
  // Parse JSON: {"processes":[{"pid":"P1","arrival":0,"burst":5},...]}
  char *procStart = strstr(input, "\"processes\"");
  if (!procStart) {
    fprintf(stderr, "Invalid JSON: missing 'processes' key\n");
    return EXIT_FAILURE;
  }
  
  // Find the array start
  char *arrayStart = strchr(procStart, '[');
  if (!arrayStart) {
    fprintf(stderr, "Invalid JSON: missing processes array\n");
    return EXIT_FAILURE;
  }
  
  // Parse each process object
  char *current = arrayStart + 1;
  int idx = 0;
  
  while (idx < MAX_PROCESSES && *current != '\0' && *current != ']') {
    // Skip whitespace and commas
    while (*current == ' ' || *current == '\t' || *current == '\n' || *current == ',') {
      current++;
    }
    if (*current == ']') break;
    if (*current != '{') {
      current++;
      continue;
    }
    
    // Parse process object
    char *pidKey = strstr(current, "\"pid\"");
    char *arrivalKey = strstr(current, "\"arrival\"");
    char *burstKey = strstr(current, "\"burst\"");
    
    if (!pidKey || !arrivalKey || !burstKey) {
      break;
    }
    
    // Extract PID - find colon after "pid", then find the value in quotes
    char *pidColon = strchr(pidKey, ':');
    if (!pidColon) break;
    pidColon++; // Move past colon
    while (*pidColon == ' ' || *pidColon == '\t') pidColon++; // Skip whitespace
    if (*pidColon != '"') break; // Value should start with quote
    pidColon++; // Move past opening quote
    char *pidValEnd = strchr(pidColon, '"');
    if (!pidValEnd) break;
    int pidLen = pidValEnd - pidColon;
    if (pidLen >= sizeof(processes[idx].pid)) pidLen = sizeof(processes[idx].pid) - 1;
    if (pidLen < 0) pidLen = 0;
    strncpy(processes[idx].pid, pidColon, pidLen);
    processes[idx].pid[pidLen] = '\0';
    
    // Extract arrival
    char *arrivalVal = strchr(arrivalKey, ':');
    if (!arrivalVal) break;
    arrivalVal++;
    while (*arrivalVal == ' ') arrivalVal++;
    processes[idx].arrival = atoi(arrivalVal);
    
    // Extract burst
    char *burstVal = strchr(burstKey, ':');
    if (!burstVal) break;
    burstVal++;
    while (*burstVal == ' ') burstVal++;
    processes[idx].burst = atoi(burstVal);
    
    if (processes[idx].burst <= 0) {
      fprintf(stderr, "Burst time must be positive for process %s\n", processes[idx].pid);
      return EXIT_FAILURE;
    }
    
    idx++;
    
    // Move to next object
    char *objEnd = strchr(current, '}');
    if (objEnd) {
      current = objEnd + 1;
    } else {
      break;
    }
  }
  
  n = idx;

  if (n <= 0 || n > MAX_PROCESSES) {
    fprintf(stderr, "Invalid process count (1-%d allowed)\n", MAX_PROCESSES);
    return EXIT_FAILURE;
  }

  qsort(processes, (size_t)n, sizeof(Process), compareArrival);

  for (int i = 0; i < n; ++i) {
    strcpy(results[i].pid, processes[i].pid);
    results[i].arrival = processes[i].arrival;
    results[i].burst = processes[i].burst;
  }

  int finished[MAX_PROCESSES] = {0};
  int completed = 0;
  int timelineCount = 0;
  int currentTime = processes[0].arrival;
  int cpuBusy = 0;

  while (completed < n) {
    int chosen = -1;
    int bestBurst = INT_MAX;

    for (int i = 0; i < n; ++i) {
      if (!finished[i] && processes[i].arrival <= currentTime) {
        if (processes[i].burst < bestBurst ||
            (processes[i].burst == bestBurst && processes[i].arrival < processes[chosen].arrival) ||
            (processes[i].burst == bestBurst && processes[i].arrival == processes[chosen].arrival &&
             strcmp(processes[i].pid, processes[chosen].pid) < 0)) {
          bestBurst = processes[i].burst;
          chosen = i;
        }
      }
    }

    if (chosen == -1) {
      int nextArrival = INT_MAX;
      for (int i = 0; i < n; ++i) {
        if (!finished[i] && processes[i].arrival < nextArrival) {
          nextArrival = processes[i].arrival;
        }
      }
      timeline[timelineCount++] = (TimelineSlot){"IDLE", currentTime, nextArrival};
      currentTime = nextArrival;
      continue;
    }

    int start = currentTime;
    int end = start + processes[chosen].burst;

    timeline[timelineCount] = (TimelineSlot){"", start, end};
    strcpy(timeline[timelineCount].pid, processes[chosen].pid);
    timelineCount += 1;

    results[chosen].start = start;
    results[chosen].completion = end;
    results[chosen].waiting = start - processes[chosen].arrival;
    results[chosen].turnaround = end - processes[chosen].arrival;

    cpuBusy += processes[chosen].burst;
    currentTime = end;
    finished[chosen] = 1;
    completed += 1;
  }

  double avgWait = 0.0;
  double avgTurn = 0.0;
  
  if (timelineCount == 0) {
    fprintf(stderr, "No timeline generated\n");
    return EXIT_FAILURE;
  }
  
  int firstStart = timeline[0].start;
  int lastEnd = timeline[timelineCount - 1].end;

  // Output JSON
  printf("{\n");
  printf("  \"timeline\": [\n");
  for (int i = 0; i < timelineCount; ++i) {
    printf("    {\"pid\":\"%s\",\"start\":%d,\"end\":%d}", 
           timeline[i].pid, timeline[i].start, timeline[i].end);
    if (i < timelineCount - 1) printf(",");
    printf("\n");
  }
  printf("  ],\n");
  printf("  \"details\": [\n");
  for (int i = 0; i < n; ++i) {
    avgWait += results[i].waiting;
    avgTurn += results[i].turnaround;
    printf("    {\"pid\":\"%s\",\"arrival\":%d,\"burst\":%d,\"startTime\":%d,\"completionTime\":%d,\"waitingTime\":%d,\"turnaroundTime\":%d}",
           results[i].pid, results[i].arrival, results[i].burst,
           results[i].start, results[i].completion, results[i].waiting, results[i].turnaround);
    if (i < n - 1) printf(",");
    printf("\n");
  }
  printf("  ],\n");
  avgWait /= n;
  avgTurn /= n;
  double utilization = (lastEnd == firstStart) ? 0.0 : (100.0 * cpuBusy / (lastEnd - firstStart));
  printf("  \"avgWaitingTime\": %.2f,\n", avgWait);
  printf("  \"avgTurnaroundTime\": %.2f,\n", avgTurn);
  printf("  \"cpuUtilization\": %.2f\n", utilization);
  printf("}\n");

  return EXIT_SUCCESS;
}
