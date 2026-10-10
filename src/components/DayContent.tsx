import type { Block, ISODate } from '../lib/types'

export interface DayContentProps {
  /** The trip's first date, used to show "Day N". */
  tripStart: ISODate
  day: { date: ISODate; location: string; blocks: Block[] }
}

// Placeholder: replaced by the public-site agent. The props above are the contract.
export default function DayContent(_props: DayContentProps) {
  return null
}
