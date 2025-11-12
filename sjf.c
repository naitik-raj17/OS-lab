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
  int n;

  printf("Enter number of processes: ");
  if (scanf("%d", &n) != 1) {
    fprintf(stderr, "Failed to read number of processes.\n");
    return EXIT_FAILURE;
  }

  if (n <= 0 || n > MAX_PROCESSES) {
    fprintf(stderr, "Invalid process count (1-%d allowed).\n", MAX_PROCESSES);
    return EXIT_FAILURE;
  }

  for (int i = 0; i < n; ++i) {
    printf("Process %d arrival time: ", i + 1);
    if (scanf("%d", &processes[i].arrival) != 1) {
      fprintf(stderr, "Invalid arrival time input.\n");
      return EXIT_FAILURE;
    }

    printf("Process %d burst time: ", i + 1);
    if (scanf("%d", &processes[i].burst) != 1) {
      fprintf(stderr, "Invalid burst time input.\n");
      return EXIT_FAILURE;
    }

    if (processes[i].burst <= 0) {
      fprintf(stderr, "Burst time must be positive.\n");
      return EXIT_FAILURE;
    }

    snprintf(processes[i].pid, sizeof(processes[i].pid), "P%d", i + 1);
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
  int firstStart = timeline[0].start;
  int lastEnd = timeline[timelineCount - 1].end;

  printf("\nGantt Chart:\n");
  for (int i = 0; i < timelineCount; ++i) {
    printf("| %s (%d -> %d) ", timeline[i].pid, timeline[i].start, timeline[i].end);
  }
  printf("|\n");

  printf("\nProcess Details:\n");
  printf("PID\tArr\tBurst\tStart\tComp\tWait\tTurn\n");
  for (int i = 0; i < n; ++i) {
    printf("%s\t%d\t%d\t%d\t%d\t%d\t%d\n",
           results[i].pid,
           results[i].arrival,
           results[i].burst,
           results[i].start,
           results[i].completion,
           results[i].waiting,
           results[i].turnaround);

    avgWait += results[i].waiting;
    avgTurn += results[i].turnaround;
  }

  avgWait /= n;
  avgTurn /= n;
  double utilization = (lastEnd == firstStart) ? 0.0 : (100.0 * cpuBusy / (lastEnd - firstStart));

  printf("\nAverage Waiting Time: %.2f\n", avgWait);
  printf("Average Turnaround Time: %.2f\n", avgTurn);
  printf("CPU Utilization: %.2f%%\n", utilization);

  return EXIT_SUCCESS;
}

