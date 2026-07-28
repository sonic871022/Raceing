# 赛道设计占位

当前先用代码里的最小默认赛道验证流程：

- 总长度：12 格
- 弯道：`[3, 7, 10]`
- 目标圈数：3

后续建议把赛道设计补成结构化数据：

```ts
type TrackCell = {
  index: number;
  kind: 'straight' | 'corner' | 'pit';
  speedLimit?: number;
  tags?: string[];
};
```

建议拆成两层：

- `track-layout`：格子拓扑、弯道、维修站
- `track-balance`：油耗、限速、奖励和惩罚参数
