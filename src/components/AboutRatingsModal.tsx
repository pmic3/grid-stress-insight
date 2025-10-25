import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import heatBalanceImage from '@/assets/heat_balance.png';

interface AboutRatingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AboutRatingsModal = ({ open, onOpenChange }: AboutRatingsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>About Dynamic Line Ratings (IEEE-738)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <img 
              src={heatBalanceImage} 
              alt="Heat Balance Diagram" 
              className="w-full rounded-md"
            />
          </div>
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">How Dynamic Ratings Work</h3>
            
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong className="text-foreground">Heat Balance:</strong> Transmission lines generate heat from electrical current (I²R) 
                while cooling through convection (wind) and radiation.
              </li>
              
              <li>
                <strong className="text-foreground">Temperature Impact:</strong> Higher ambient temperature reduces the temperature 
                differential, decreasing cooling effectiveness and lowering the safe current capacity.
              </li>
              
              <li>
                <strong className="text-foreground">Wind Impact:</strong> Higher crosswind speeds increase convective cooling, 
                allowing lines to safely carry more current before reaching their maximum operating temperature (MOT).
              </li>
              
              <li>
                <strong className="text-foreground">Nameplate vs Dynamic:</strong> Nameplate ratings are conservative static limits. 
                Dynamic ratings adjust in real-time based on weather conditions, often allowing 15-40% more capacity on cooler, windy days.
              </li>
            </ul>
            
            <p className="pt-2 text-xs">
              <strong>Assumptions:</strong> Power factor ≈ 1.0, temperature coefficient α = 0.0039 (if not specified), 
              single-point weather per line, simplified IEEE-738 heat balance model.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AboutRatingsModal;
