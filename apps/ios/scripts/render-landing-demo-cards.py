from pathlib import Path
import json,calendar,datetime,sys
r=Path(__file__).resolve().parents[3]; ios=r/'apps/ios/Stubbed'; out=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/stubbed-native-cards').resolve(); out.mkdir(parents=True,exist_ok=True)
s='import SwiftUI\nimport AppKit\nimport MapKit\n'
stats=(ios/'Data/Insights.swift').read_text();s+=stats[stats.index('struct InsightStats'):stats.index('\nenum Insights')]+stats[stats.index('enum ActivityGrid'):]
s+='''
enum Day {
 static func today() -> String { "2026-11-05" }
 static func date(_ day:String) -> Date { let f=DateFormatter();f.dateFormat="yyyy-MM-dd";f.timeZone=TimeZone(secondsFromGMT:0);return f.date(from:day)! }
}
enum ShowType:String { case musical,play,opera,dance,comedy,standup,other
 static let ordered:[Self] = [.musical,.play,.opera,.dance,.comedy,.standup,.other]
 var label:String { self == .standup ? "Stand-up" : rawValue.capitalized }
}
enum CardInk { static let ground=Color(white:0.11) }
enum Palette { static let tint=Color.red }
enum Radius { static let sm:CGFloat=8 }
'''
appearance=(ios/'Screens/Share/ShareAppearance.swift').read_text();s+=appearance[:appearance.index('/// A background as a round swatch:')]
footer=(ios/'Screens/Share/EntryCard.swift').read_text();footer=footer[footer.index('struct CardFooter:'):footer.index('/// The photo, filling')];footer=footer.replace('Image("BrandMark")','Image(nsImage: NSImage(contentsOfFile: "/tmp/stubbed-384/apps/web/public/brand/stubbed-mark.png")!)');s+=footer
views=(ios/'Screens/Share/InsightCard.swift').read_text();s+=views[views.index('enum InsightCardDesign'):views.index('extension ShareCards')].replace('case .countries: ShareCountriesCard(data: data, ink: ink, accent: accent)', 'case .countries: ShareCountriesCard(data: data, ink: ink, accent: accent).frame(height: 420)')
s+=(ios/'Screens/Share/InsightSectionCards.swift').read_text().replace('.frame(maxWidth: .infinity)\n      VStack(spacing: 6)', '.frame(width: 484, height: 242)\n      VStack(spacing: 6)')
charts=(ios/'Screens/Insights/InsightCharts.swift').read_text();charts=charts[:charts.index('struct CategoryRadar')].replace('Bundle.main.url(forResource: "Countries", withExtension: "geojson")','Optional(URL(fileURLWithPath: "/tmp/stubbed-384/apps/ios/Stubbed/Resources/Countries.geojson"))').replace('Color(.tertiarySystemFill)','Color.gray').replace('Color(.systemGray4)','Color.gray').replace('Color(.secondarySystemGroupedBackground)','Color.gray');s+=charts
s+='''
@main struct Export {
 @MainActor static func main() throws {
  let stats=try JSONDecoder().decode(InsightStats.self,from:Data(contentsOf:URL(fileURLWithPath:"/tmp/stubbed-native-cards/data.json")))
  for design in [InsightCardDesign.activity,.repeats,.countries,.history,.daily,.bestWeekly,.bestDaily] {
   let data=InsightCardData(stats:stats,year:design == .history ? nil : 2026,handle:"sillyelphaba",currentYear:2026)
   let renderer=ImageRenderer(content:InsightCardView(design:design,data:data,appearance:.init(background:.dark)).environment(\\.locale, Locale(identifier:"en_GB")))
   renderer.scale=2
   guard let image=renderer.nsImage,let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else { fatalError("No image") }
   try png.write(to:URL(fileURLWithPath:"/tmp/stubbed-native-cards/\\(design.rawValue).png"))
   print(design.rawValue)
  }
 }
}
'''
s=s.replace('/tmp/stubbed-384',str(r)).replace('/tmp/stubbed-native-cards',str(out))
(out/'Export.swift').write_text(s)
# Each month keeps the existing year-card counts. A coherent 12-week spring
# run and 8-week autumn run, with no 13th/9th adjoining week.
counts=[5,5,6,4,6,5,7,5,6,6,2,0]
fixed={1:[7,14,21,28],2:[4,11,18,25],3:[4,11,18,25],4:[8,15,22,29],5:[6,13,20,27],6:[3,10,17,24],7:[8,15,22,29],8:[5,12,19,26],9:[16,23,30],10:[7,14,21,28],11:[2,4],12:[]}
# Additional same-day visits allow the intensity scale to show matinee doubles.
days=[]
for month,total in enumerate(counts,1):
 values={d:1 for d in fixed[month]}
 if month==3: values[26]=1;values[27]=1 # best daily run of three
 left=total-sum(values.values())
 for day in list(values):
  if left<=0:break
  values[day]+=1;left-=1
 assert left==0
 for i,(day,count) in enumerate(values.items()):
  offset = [-2,0,1,2][(month+i)%4] if month != 11 and not (month==3 and day>=25) else 0
  shifted = day+offset
  if shifted<1 or shifted>calendar.monthrange(2026,month)[1]: shifted=day
  days.append({'date':f'2026-{month:02}-{shifted:02}','count':count})
data={'total':57,'unique_shows':34,'repeated_shows':[{'id':f'00000000-0000-4000-a000-{i:012}','title':title,'count':count,'rank':i} for i,(title,count) in enumerate([('Operation Mincemeat',7),('Hadestown',5),('Cabaret',4),('Wicked',3),('The Lost Boys',2)],1)],'unlocated':0,'streaks':{'current_daily':1,'longest_daily':3,'current_weekly':8,'longest_weekly':12},'years':[{'year':2024,'count':61},{'year':2025,'count':66},{'year':2026,'count':57}],'months':[{'month':f'2026-{i:02}','count':count}for i,count in enumerate(counts,1)],'days':days,'types':[{'type':t,'count':n}for t,n in [('musical',44),('play',8),('comedy',3),('standup',2)]],'countries':[{'country':'GB','count':49},{'country':'US','count':8}]}
assert sum(x['count']for x in days)==57
(out/'data.json').write_text(json.dumps(data,indent=2))
