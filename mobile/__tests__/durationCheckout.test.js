const React=require('react'),{act,create}=require('react-test-renderer');
jest.mock('../src/services/payments',()=>({...jest.requireActual('../src/services/payments'),createPaymentSession:jest.fn()}));
const {createPaymentSession}=require('../src/services/payments'),{PatientCheckout}=require('../src/components/Payments'),{Action,Field,Copy}=require('../src/ui/design');
let tree,s;afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});
test.each([[15,51],[30,101],[60,202]])('%s minute checkout displays authoritative quote %s and sends duration',async(duration,total)=>{
 s={dispose:jest.fn(),fee:jest.fn().mockResolvedValue({doctorId:'doctor',amountMinor:101,totalMinor:total,revision:2}),checkout:jest.fn().mockResolvedValue({kind:'free',appointmentId:'fixture'}),history:jest.fn()};createPaymentSession.mockReturnValue(s);
 const start=Date.parse('2026-11-05T09:15:00Z');await act(async()=>{tree=create(<PatientCheckout uid="patient" doctorId="doctor" startAt={start} durationMinutes={duration} confirmed={jest.fn()}/>);});
 expect(s.fee).toHaveBeenCalledWith('doctor',duration);const json=tree.root.findAllByType(Copy).map(n=>React.Children.toArray(n.props.children).filter(v=>typeof v==='string'||typeof v==='number').join('')).join('\n');expect(json).toContain(`Online consultation: ${duration} minutes`);expect(json).toContain(`KSh ${Math.trunc(total/100)}.${String(total%100).padStart(2,'0')}`);expect(json).toContain(new Date(start+duration*60000).toLocaleTimeString());
 await act(async()=>tree.root.findByType(Field).props.onChangeText('0700000000'));await act(async()=>tree.root.findAllByType(Action).find(n=>n.props.title==='Confirm demo payment').props.onPress());
 const input=s.checkout.mock.calls[0][0];expect(input.durationMinutes??30).toBe(duration);expect(input.amountMinor).toBeUndefined();
});
test('a stale backend without a selected-duration quote cannot enable payment',async()=>{s={dispose:jest.fn(),fee:jest.fn().mockResolvedValue({amountMinor:101,revision:1})};createPaymentSession.mockReturnValue(s);await act(async()=>{tree=create(<PatientCheckout uid="patient" doctorId="doctor" startAt={Date.now()+86400000} durationMinutes={15} confirmed={jest.fn()}/>);});expect(tree.root.findAllByType(Action).find(n=>n.props.title==='Confirm demo payment').props.disabled).toBe(true);});
